// How much of the host's API credit budget this app's own calls have spent, and
// when that spend ages out. Pure — no clock of its own, no platform — so the
// arithmetic can be reasoned about directly.
//
// This is accounting, NOT a reading — and the distinction is sharper than "Miro
// doesn't tell us". Miro *does* report usage: every REST API response carries
// X-RateLimit-Limit / -Remaining / -Reset. But those are HTTP response headers,
// and the Web SDK never hands us an HTTP response — calls are proxied through
// Miro's iframe host and come back as resolved promises. The SDK's own
// rate-limiting page documents no headers and no usage-query method. So the
// numbers exist and are simply out of reach from here, which is why every figure
// below is derived from calls we counted ourselves.
//
// That is the whole reason the UI says "spent by this app" and never "budget
// remaining". The budget is per user per application, so other Miro apps don't
// draw on it — but this same app in another browser, or a REST integration on
// its credentials, does, and we cannot see either. A bar claiming to show what's
// left would be exactly the plausible-looking value this codebase refuses to
// fabricate, and wrong in precisely the case it exists for. What it can say
// honestly is what *we* spent, and that answers the question worth asking when
// the board stops responding: is it us?
//
// Charges are bucketed per second rather than kept per call. An hour is then at
// most 3600 buckets however hard the board is being worked — which bounds both
// memory and the persisted payload — and one second is far finer than a
// 60s/3600s window needs.

// Miro's two budgets. They fail very differently (see adapters/miro/rateLimit),
// but the arithmetic over them is identical, so here they are just two windows.
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const MINUTE_BUDGET = 100_000;
export const HOUR_BUDGET = 1_000_000;

// t = whole seconds since the epoch; c = credits charged during that second.
export type Bucket = { t: number; c: number };

export interface CreditWindow {
  spent: number;
  budget: number;
  // When the sliding sum next drops back under budget, or null when it already
  // is. This is not a reset time — see `recoveryAt`.
  recoversAt: number | null;
}

export interface CreditUsage {
  minute: CreditWindow;
  hour: CreditWindow;
}

const secondOf = (ms: number): number => Math.floor(ms / 1000);

// Appends a charge to a ring and drops what has aged out.
//
// Returns a new array rather than mutating: the ring is handed to subscribers
// and to React, where mutating in place would let a render read a half-updated
// one and skip the re-render that follows.
export function addCharge(buckets: Bucket[], nowMs: number, cost: number): Bucket[] {
  const t = secondOf(nowMs);
  const last = buckets[buckets.length - 1];
  const next =
    last?.t === t
      ? [...buckets.slice(0, -1), { t, c: last.c + cost }]
      : [...buckets, { t, c: cost }];
  return prune(next, nowMs);
}

// Drops charges too old to affect either figure. Filtering by time rather than
// by position, so a ring that isn't perfectly ordered (a merge, a clock that
// stepped backwards) still prunes correctly.
export function prune(buckets: Bucket[], nowMs: number): Bucket[] {
  const cutoff = secondOf(nowMs - HOUR_MS);
  return buckets.filter((bucket) => bucket.t > cutoff);
}

export function spentWithin(buckets: Bucket[], nowMs: number, windowMs: number): number {
  const cutoff = secondOf(nowMs - windowMs);
  let total = 0;
  for (const bucket of buckets) if (bucket.t > cutoff) total += bucket.c;
  return total;
}

// When the sliding sum next falls back under budget.
//
// A sliding window has no reset moment: the budget drips back continuously as
// individual charges age out, so "when does it reset" has no answer, and a
// countdown to one would be invented rather than derived. What can be answered
// is when enough charges will have aged out for the sum to fit again — retire
// them oldest-first until the remainder is under budget, and the last one
// retired sets the deadline.
//
// A bucket's charges land anywhere within its second, so the whole bucket has
// left the window only a full window after that second *ends*. Rounding that way
// means the countdown can finish a moment early but never promises recovery that
// hasn't happened.
//
// null means the sum is already under budget: nothing to wait for.
export function recoveryAt(
  buckets: Bucket[],
  nowMs: number,
  windowMs: number,
  budget: number,
): number | null {
  let remaining = spentWithin(buckets, nowMs, windowMs);
  if (remaining <= budget) return null;
  const cutoff = secondOf(nowMs - windowMs);
  const live = buckets.filter((bucket) => bucket.t > cutoff).sort((a, b) => a.t - b.t);
  for (const bucket of live) {
    remaining -= bucket.c;
    if (remaining <= budget) return (bucket.t + 1) * 1000 + windowMs;
  }
  // Retiring every live charge empties the window, so the loop returns for any
  // budget at or above zero — which every real budget is.
  return null;
}

// One ring per page load, summed for display. The pages spend a single budget
// between them, so the total is the only figure that means anything; keeping the
// rings apart until here is what stops a page's own broadcast being counted
// twice (see adapters/browser/credits).
export function merge(rings: Bucket[][]): Bucket[] {
  const byT = new Map<number, number>();
  for (const ring of rings) {
    for (const bucket of ring) byT.set(bucket.t, (byT.get(bucket.t) ?? 0) + bucket.c);
  }
  return [...byT]
    .map(([t, c]) => ({ t, c }))
    .sort((a, b) => a.t - b.t);
}

// The whole figure the UI renders, from one merged ring.
export function usageOf(buckets: Bucket[], nowMs: number): CreditUsage {
  return {
    minute: windowOf(buckets, nowMs, MINUTE_MS, MINUTE_BUDGET),
    hour: windowOf(buckets, nowMs, HOUR_MS, HOUR_BUDGET),
  };
}

function windowOf(
  buckets: Bucket[],
  nowMs: number,
  windowMs: number,
  budget: number,
): CreditWindow {
  return {
    spent: spentWithin(buckets, nowMs, windowMs),
    budget,
    recoversAt: recoveryAt(buckets, nowMs, windowMs, budget),
  };
}

// Identifies one page *load*, not one page.
//
// A reloaded board page takes a new id, so the ring it spent before the reload
// survives beside the fresh page's empty one instead of being overwritten by it
// — which is the point: those credits were really spent and still count against
// the hour. A dead load's ring ages out by itself within the hour, so nothing
// has to notice the page went away.
export function newSourceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Storage and the channel are untrusted input — an older build's shape, a hand
// edit — so a ring coming from either is filtered through this.
export function isBucket(value: unknown): value is Bucket {
  return (
    !!value &&
    typeof (value as Bucket).t === 'number' &&
    typeof (value as Bucket).c === 'number' &&
    Number.isFinite((value as Bucket).t) &&
    Number.isFinite((value as Bucket).c)
  );
}
