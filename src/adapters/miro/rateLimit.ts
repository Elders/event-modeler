// The single rate-limit gate every Miro SDK call passes through — reads, writes,
// and app-data alike. Miro throttles with HTTP 429s under sustained load (the
// headless board script polls every few seconds, and bulk generation bursts
// dozens of creates), so two mechanisms cooperate here:
//
//   * Adaptive pacing. A global minimum gap between call starts that is 0 while
//     the board is responding cleanly — so normal interactions and Promise.all
//     batches stay fully concurrent and fast — and ramps up the moment 429s
//     appear, spacing every subsequent call until the pressure clears, then
//     decaying back to 0. This discovers Miro's limit instead of hardcoding it.
//   * Retry with backoff. Any call that still 429s is retried, so a transient
//     limit never surfaces as a user-visible failure.
//
// Centralizing this means no caller can bypass it: a new adapter method is rate
// limited simply by going through `withRateLimit`.

// Backoff schedule for a call that 429s despite pacing. Generous tail so a bulk
// run rides out even a per-minute window rather than giving up partway.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 16000, 30000];

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

function isRateLimited(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return true;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit')
  );
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
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

// True while the limiter is actively pacing because of recent 429s. Background
// loops (the headless housekeeping) check this and stand down, so they don't pile
// more writes onto an already-saturated board and deepen the rate-limit spiral —
// the gap then decays on the few calls still going through, and they resume.
export function isUnderRateLimit(): boolean {
  return adaptiveGapMs >= 500;
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
