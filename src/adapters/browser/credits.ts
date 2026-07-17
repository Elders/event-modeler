// The browser implementation of the CreditMeter port.
//
// Built like the diagnostics log next door, and for the same reason: the tool is
// two pages, not one. The board script and the panel are separate iframes with
// separate module instances, spending a single budget between them — the board
// script does most of the spending (the housekeeping passes) while the person
// who wants to know is looking at the panel. So the figure travels over a
// BroadcastChannel: same origin, and no Miro credits to move it, which matters
// when the thing it reports on is the credit budget running out.
//
// Two departures from the log, both load-bearing:
//
//   * Rings are kept per source, never merged into one pile. The log
//     deduplicates by entry id; a credit charge has no such id, so a page that
//     re-broadcast its spend into a shared pile would have it counted twice.
//     Keyed by source, a re-broadcast just replaces what was already there,
//     which makes every message idempotent and lets a ring be sent whole rather
//     than as a delta nobody could reconcile after a dropped message.
//   * A source is one page *load*, not one page — see domain/credits.newSourceId.
//
// Persistence is unconditional, unlike the log's opt-in. An hourly figure that
// zeroes on refresh is worthless at the exact moment it is wanted, because
// refreshing is what people do when the board stops responding. The board page
// is its single writer, as with the log, and for the same no-lost-update reason.

import {
  addCharge,
  isBucket,
  merge,
  newSourceId,
  prune,
  usageOf,
  type Bucket,
  type CreditUsage,
} from '../../domain/credits';
import type { CreditExhaustion, CreditMeter } from '../../ports/credits';

const CHANNEL = 'em-credits';
const RINGS_KEY = 'em.credits.rings';

// A bulk run charges many times a second. Broadcasting and re-serialising the
// ring on each one would cost more than the calls being counted, and nothing
// reads the figure faster than once a second anyway.
const SHARE_DEBOUNCE_MS = 1_000;
const PERSIST_DEBOUNCE_MS = 1_000;

type Message =
  | { kind: 'ring'; source: string; buckets: Bucket[] }
  | { kind: 'replay-request' }
  | { kind: 'replay'; rings: [string, Bucket[]][] }
  | { kind: 'exhausted'; exhaustion: CreditExhaustion };

export class BrowserCreditMeter implements CreditMeter {
  private rings = new Map<string, Bucket[]>();
  private readonly source = newSourceId();
  private readonly persister: boolean;
  private channel: BroadcastChannel | null = null;
  private shareTimer: number | null = null;
  private persistTimer: number | null = null;
  private exhausted: CreditExhaustion | null = null;

  constructor(persister: boolean) {
    this.persister = persister;
    // Both pages read what is stored; only the board writes it. Reading from
    // anywhere means the panel doesn't depend on a replay arriving — that
    // request is answered only if another page happens to be listening already,
    // which is the startup race the log lost once with a perfectly intact log
    // sitting in storage.
    for (const [source, buckets] of readStoredRings()) this.rings.set(source, buckets);
    this.openChannel();
    this.post({ kind: 'replay-request' });
    // A debounced write is a write that hasn't happened, and a board refresh is
    // both the most likely way this page ends and the moment the stored figure
    // has to be right.
    window.addEventListener('pagehide', () => this.flush());
  }

  charge(cost: number): void {
    // A nonsensical cost is dropped rather than added: this is called on every
    // SDK call and must not throw, and a NaN would poison every later sum
    // silently — the bar would read NaN with no clue where it came from.
    if (!Number.isFinite(cost) || cost <= 0) return;
    this.rings.set(this.source, addCharge(this.own(), Date.now(), cost));
    this.share();
  }

  markExhausted(exhaustion: CreditExhaustion): void {
    this.exhausted = exhaustion;
    // Deliberately not persisted. The cooldown it describes lives in the rate
    // limiter's module state and dies with the page, so a stored one would
    // outlive the thing it reports and claim a stand-down that isn't happening.
    // After a refresh the loops resume, and if the budget really is still gone
    // the next 429 marks it again within seconds.
    this.post({ kind: 'exhausted', exhaustion });
  }

  usage(): CreditUsage {
    const now = Date.now();
    this.sweep(now);
    return usageOf(merge([...this.rings.values()]), now);
  }

  exhaustion(): CreditExhaustion | null {
    if (!this.exhausted) return null;
    // Expires itself: the cooldown lapsing is all "recovered" means here, and
    // nothing else is coming along to clear it.
    if (Date.now() >= this.exhausted.untilMs) this.exhausted = null;
    return this.exhausted;
  }

  private own(): Bucket[] {
    return this.rings.get(this.source) ?? [];
  }

  // Drops what has aged out, and forgets a source whose ring is now empty: a
  // page load that stopped spending over an hour ago has nothing left to
  // contribute, and its entry would otherwise sit in the map for the whole
  // session — one per refresh, forever. Our own stays; we will charge it again.
  private sweep(nowMs: number): void {
    for (const [source, buckets] of this.rings) {
      const live = prune(buckets, nowMs);
      if (live.length === 0 && source !== this.source) this.rings.delete(source);
      else this.rings.set(source, live);
    }
  }

  private openChannel(): void {
    // BroadcastChannel is the only cross-frame path that costs nothing. Without
    // it each page still meters itself — degraded, not broken.
    if (typeof BroadcastChannel === 'undefined') return;
    guard(() => {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (event: MessageEvent<Message>) => this.receive(event.data);
    });
  }

  private receive(message: Message): void {
    switch (message.kind) {
      case 'ring':
        this.adopt(message.source, message.buckets);
        break;
      case 'replay':
        for (const [source, buckets] of message.rings) this.adopt(source, buckets);
        break;
      case 'replay-request':
        // Answer with every ring we hold, not just our own: a page that arrives
        // late learns about pages that have since gone away, whose spend is
        // still inside the hour.
        if (this.rings.size > 0) this.post({ kind: 'replay', rings: [...this.rings] });
        break;
      case 'exhausted':
        this.exhausted = message.exhaustion;
        break;
    }
  }

  // Takes another source's ring at face value — it is the authority on its own
  // spend, so this replaces rather than merges.
  private adopt(source: string, buckets: unknown[]): void {
    // Never let anyone hand us our own ring back. A replay carries the sender's
    // copy of every source it knows, including a possibly stale copy of ours,
    // and adopting that would silently roll our own spend backwards.
    if (source === this.source) return;
    this.rings.set(source, buckets.filter(isBucket));
    this.savePersisted();
  }

  private share(): void {
    if (this.shareTimer !== null) return;
    this.shareTimer = window.setTimeout(() => {
      this.shareTimer = null;
      this.post({ kind: 'ring', source: this.source, buckets: this.own() });
      this.savePersisted();
    }, SHARE_DEBOUNCE_MS);
  }

  private savePersisted(): void {
    if (!this.persister) return;
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.flush(), PERSIST_DEBOUNCE_MS);
  }

  private flush(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (!this.persister) return;
    this.sweep(Date.now());
    guard(() => localStorage.setItem(RINGS_KEY, JSON.stringify([...this.rings])));
  }

  private post(message: Message): void {
    guard(() => this.channel?.postMessage(message));
  }
}

function readStoredRings(): [string, Bucket[]][] {
  const raw = guard(() => localStorage.getItem(RINGS_KEY));
  if (!raw) return [];
  const parsed = guard(() => JSON.parse(raw) as unknown);
  if (!Array.isArray(parsed)) return [];
  const now = Date.now();
  const rings: [string, Bucket[]][] = [];
  for (const entry of parsed) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [source, buckets] = entry as [unknown, unknown];
    if (typeof source !== 'string' || !Array.isArray(buckets)) continue;
    // Pruning on the way in matters more than it looks: a board left closed
    // overnight would otherwise reopen showing an hour's spend from yesterday.
    const live = prune(buckets.filter(isBucket), now);
    if (live.length > 0) rings.push([source, live]);
  }
  return rings;
}

// The meter's own failures have nowhere to report to — it is an adapter, so it
// does not hold Diagnostics, and a storage failure during a rate-limit storm
// would be the noisiest entry in the log at the worst moment. Same reasoning as
// the guard in diagnostics.ts, and the same outcome: localStorage can throw
// (quota, or storage blocked outright in a third-party iframe) and
// BroadcastChannel can throw on a closed channel, neither of which is worth
// taking the app down for, so both degrade to a console line and the meter
// carries on in memory.
//
// This is not a swallowed failure of the kind the codebase forbids: nothing here
// fabricates a figure. A meter that cannot reach storage reports the spend it
// counted this session, which is a true answer to a smaller question — and the
// bar says "spent by this app" precisely because it never claimed to know more.
function guard<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.error('The credit meter could not reach browser storage', error);
    return undefined;
  }
}
