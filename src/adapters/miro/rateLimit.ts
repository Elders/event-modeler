// The single rate-limit gate every Miro SDK call passes through — reads, writes,
// and app-data alike. Miro throttles with HTTP 429s under sustained load (the
// headless board script polls every few seconds, and bulk generation bursts
// dozens of creates), so three mechanisms cooperate here:
//
//   * Adaptive pacing. A global minimum gap between call starts that is 0 while
//     the board is responding cleanly — so normal interactions and Promise.all
//     batches stay fully concurrent and fast — and ramps up the moment 429s
//     appear, spacing every subsequent call until the pressure clears, then
//     decaying back to 0. This discovers Miro's limit instead of hardcoding it.
//   * Retry with backoff, for the *per-minute* limit — genuinely transient.
//   * A cooldown, for the *per-hour* limit — not transient at all.
//
// Miro enforces two budgets, and they fail very differently:
//
//   "up to 100000 credits in total per minute"  — a burst ceiling. Waiting a few
//                                                 seconds fixes it.
//   "up to 1000000 credits in total per hour"   — a sustained ceiling, ~16.7k
//                                                 credits/minute averaged. You
//                                                 can sit far under the burst
//                                                 ceiling and still exhaust this
//                                                 one over an hour, and then
//                                                 nothing works until the window
//                                                 rolls.
//
// The hourly one is what took the Fields tab out for an hour (see DECISIONS.md).
// Backoff is the wrong response to it — every retry spends more of a budget that
// is already gone — so the two are told apart and handled differently.
//
// Centralizing this means no caller can bypass it: a new adapter method is rate
// limited simply by going through `withRateLimit`.

import { HostUnavailableError } from '../../ports/errors';

// Backoff schedule for a call that 429s despite pacing. Generous tail so a bulk
// run rides out even a per-minute window rather than giving up partway. Only
// used for the per-minute limit; see above.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000, 30000];

// How long background work stands down after a 429. The per-hour budget refills
// on a rolling window, so standing down is what actually lets it recover; the
// occasional probe call once the cooldown lapses costs almost nothing.
const COOLDOWN_MINUTE_MS = 30_000;
const COOLDOWN_HOUR_MS = 5 * 60_000;

let cooldownUntil = 0;

// Adaptive pacing bounds. The gap grows on a 429 and halves on success, so under
// sustained pressure it settles at an equilibrium just under the live limit, and
// once the pressure clears it falls back to 0 (full speed) within a few calls.
const MAX_GAP_MS = 2000;
const grow = (gap: number) => Math.min(MAX_GAP_MS, gap * 2 + 100);
const shrink = (gap: number) => (gap <= 50 ? 0 : Math.floor(gap / 2));

let adaptiveGapMs = 0;
let nextSlot = 0;

// A steady floor applied during bulk operations (model generation): even before
// any 429, a burst of creates is spaced so it flows under the limit from the
// start. Dropped the instant the run aborts so a Pause isn't drawn out.
const BULK_GAP_MS = 500;
let bulkGapMs = 0;
let bulkAborting = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).toLowerCase();
}

function isRateLimited(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return true;
  const message = messageOf(error);
  return (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  );
}

// Which budget was hit. Miro names the window in the message ("...per hour"),
// which is the only signal available — the SDK surfaces no headers. Unrecognised
// wording returns null and is treated as the transient case, so a change to
// Miro's phrasing degrades to the old retry behaviour rather than to a five
// minute stand-down nobody asked for.
function rateLimitWindow(error: unknown): 'minute' | 'hour' | null {
  const message = messageOf(error);
  if (message.includes('per hour')) return 'hour';
  if (message.includes('per minute')) return 'minute';
  return null;
}

// Reserves this call's start slot. The slot is taken synchronously (before any
// await) so even Promise.all'd calls are spaced without racing for the same one.
async function pace(): Promise<void> {
  const gap = Math.max(adaptiveGapMs, bulkAborting ? 0 : bulkGapMs);
  if (gap <= 0) return;
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + gap;
  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}

export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await pace();
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await fn();
      if (adaptiveGapMs > 0) adaptiveGapMs = shrink(adaptiveGapMs);
      return result;
    } catch (error) {
      if (!isRateLimited(error)) throw error;
      adaptiveGapMs = grow(adaptiveGapMs); // throttle everything that follows
      const window = rateLimitWindow(error);
      const exhausted = window === 'hour';
      cooldownUntil = Date.now() + (exhausted ? COOLDOWN_HOUR_MS : COOLDOWN_MINUTE_MS);

      // The hourly budget does not refill in seconds, so retrying it is not
      // riding out a blip — it is spending more of a budget that has already run
      // out, and making the outage longer. Fail fast and let the cooldown work.
      // Out of retries means the same thing for the per-minute case. Either way,
      // say it in the type, so a caller that means to carry on past a failure can
      // tell this from the board answering "no" (see ports/errors).
      if (exhausted || attempt >= RETRY_DELAYS_MS.length) {
        throw new HostUnavailableError(
          exhausted
            ? "The board's hourly API credit budget is exhausted — it won't answer until the window rolls over."
            : 'The board is rate limiting us and did not recover within the retry window.',
          error,
        );
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// True while a recent 429 says the board wants to be left alone. EVERY background
// loop checks this and stands down; only work the user actually asked for should
// push through, and it now fails with a real message rather than silently.
//
// This used to be `adaptiveGapMs >= 500`, which was a reasonable proxy for the
// per-minute limit and useless against the per-hour one: the gap halves on every
// success and reaches zero after ~8 calls, so the loops would resume within
// seconds and immediately re-exhaust an hourly budget that needs minutes to
// refill. It is a deadline now, not a gauge.
export function isUnderRateLimit(): boolean {
  return Date.now() < cooldownUntil;
}

// Enables/disables the bulk pacing floor. A burst hint, not board state: the
// headless board script and the panel keep separate module instances, so toggling
// it in the panel only paces the panel's writes (generation).
export function setBulkWrites(on: boolean, signal?: AbortSignal): void {
  bulkGapMs = on ? BULK_GAP_MS : 0;
  if (on) {
    nextSlot = Date.now();
    bulkAborting = false;
    if (signal) signal.addEventListener('abort', () => void (bulkAborting = true), { once: true });
  }
}
