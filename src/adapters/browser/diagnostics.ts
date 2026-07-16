// The browser implementation of the Diagnostics port.
//
// The hard part is that the tool is two pages, not one. The headless board
// script and the panel are separate iframes with separate consoles, and the
// failures that matter most (the housekeeping loops, the completeness check)
// happen on the board page while the person reading the log is looking at the
// panel. So entries travel over a BroadcastChannel — same origin, no Miro API
// credits, which matters when the failure being reported is the credit budget
// running out. Board app data is not an option for the same reason, on top of
// its ~31 KB total budget.
//
// Both pages hold the whole log. A page broadcasts each entry as it happens;
// a page that starts later (the panel, which the user opens and closes) asks
// for a replay, so entries logged before it existed are not lost.
//
// Persistence is off by default and, when on, is written by the board page
// alone: it is the page that lives for the whole session, it already receives
// the panel's entries over the channel, and a single writer means no lost-update
// race on the shared key.

import {
  describeError,
  mergeEntries,
  newLogId,
  type LogEntry,
  type LogLevel,
  type LogSource,
} from '../../domain/diagnostics';
import type { Diagnostics } from '../../ports/diagnostics';

const CHANNEL = 'em-diagnostics';
const PERSIST_KEY = 'em.diagnostics.persist';
const LOG_KEY = 'em.diagnostics.log';

// Persisting on every entry would write the whole log 500 times during a
// rate-limit storm; the board page batches instead.
const PERSIST_DEBOUNCE_MS = 500;

type Message =
  | { kind: 'entry'; entry: LogEntry }
  | { kind: 'replay-request' }
  | { kind: 'replay'; entries: LogEntry[] }
  | { kind: 'clear' }
  | { kind: 'persist'; on: boolean };

export class BrowserDiagnostics implements Diagnostics {
  private log: LogEntry[] = [];
  private handlers = new Set<(entries: LogEntry[]) => void>();
  private channel: BroadcastChannel | null = null;
  private persist = false;
  private persistTimer: number | null = null;
  private readonly source: LogSource;
  // True only on the board page. See the note above on why the log has exactly
  // one writer.
  private readonly persister: boolean;

  constructor(source: LogSource, persister: boolean) {
    this.source = source;
    this.persister = persister;
    this.persist = readPersistFlag();
    // BOTH pages read the stored log; only the board writes it. Reading is safe
    // from anywhere, and it means the panel doesn't depend on a replay arriving:
    // that request is sent once and answered only if the other page happens to
    // be listening already, so a persisted log was invisible whenever the panel
    // won the startup race — while sitting in storage, intact.
    if (this.persist) this.log = readStoredLog();
    this.openChannel();
    // Still ask: with persistence off there is nothing stored to read, and the
    // board's history is only obtainable from the board.
    if (!this.persister) this.post({ kind: 'replay-request' });
    // A debounced write is a write that hasn't happened. The page can go away in
    // between — a board refresh moments after ticking the box was enough to lose
    // the log the box exists to keep.
    window.addEventListener('pagehide', () => this.flush());
  }

  report(
    level: LogLevel,
    message: string,
    error?: unknown,
    context?: Record<string, string | number | boolean | null>,
  ): void {
    const { detail, stack } = describeError(error);
    const entry: LogEntry = {
      id: newLogId(),
      time: Date.now(),
      level,
      source: this.source,
      message,
      ...(detail ? { detail } : {}),
      ...(stack ? { stack } : {}),
      ...(context ? { context } : {}),
    };
    // Still write it to the real console: devtools remains the fastest way to
    // read a failure while developing, and the Console tab is additive to it.
    (level === 'error' ? console.error : console.warn)(message, error ?? '');
    this.absorb([entry]);
    this.post({ kind: 'entry', entry });
  }

  entries(): LogEntry[] {
    return this.log;
  }

  subscribe(handler: (entries: LogEntry[]) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  clear(): void {
    this.log = [];
    this.emit();
    this.savePersisted();
    this.post({ kind: 'clear' });
  }

  persisted(): boolean {
    return this.persist;
  }

  setPersisted(on: boolean): void {
    this.persist = on;
    // The flag lives in storage as well as on the channel: the board page has to
    // honour it after its own next reload, when no one is around to tell it.
    guard(() => localStorage.setItem(PERSIST_KEY, on ? 'true' : 'false'));
    this.post({ kind: 'persist', on });
    this.applyPersist();
  }

  private openChannel(): void {
    // BroadcastChannel is the only cross-frame path that costs nothing. Without
    // it the log still works, just per-page — degraded, not broken.
    if (typeof BroadcastChannel === 'undefined') return;
    guard(() => {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (event: MessageEvent<Message>) => this.receive(event.data);
    });
  }

  private receive(message: Message): void {
    switch (message.kind) {
      case 'entry':
        this.absorb([message.entry]);
        break;
      case 'replay':
        this.absorb(message.entries);
        break;
      case 'replay-request':
        // Only a page with history answers; replying with an empty log would be
        // harmless but pointless chatter.
        if (this.log.length > 0) this.post({ kind: 'replay', entries: this.log });
        break;
      case 'clear':
        this.log = [];
        this.emit();
        this.savePersisted();
        break;
      case 'persist':
        this.persist = message.on;
        this.applyPersist();
        break;
    }
  }

  private absorb(entries: LogEntry[]): void {
    const merged = mergeEntries(this.log, entries);
    // A replay of what we already have changes nothing — don't wake subscribers
    // or rewrite storage for it.
    if (merged.length === this.log.length && merged.every((e, i) => e.id === this.log[i]?.id)) {
      return;
    }
    this.log = merged;
    this.emit();
    this.savePersisted();
  }

  private emit(): void {
    for (const handler of this.handlers) handler(this.log);
  }

  private applyPersist(): void {
    if (!this.persister) return;
    // Turning persistence off drops what was already stored: the user asked for
    // the log not to outlive the session, and a stale log left behind would
    // reappear after the next refresh.
    if (!this.persist) {
      this.cancelPendingWrite();
      guard(() => localStorage.removeItem(LOG_KEY));
      return;
    }
    // Written now, not in 500ms: the user just asked for the log to survive a
    // reload, and the very next thing they do may be that reload. One toggle is
    // not the write storm the debounce exists for.
    this.flush();
  }

  // Batches the writes a burst of entries would otherwise cause — during a
  // rate-limit storm the log changes every few seconds, and each write
  // re-serializes all of it.
  private savePersisted(): void {
    if (!this.persister || !this.persist) return;
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.flush(), PERSIST_DEBOUNCE_MS);
  }

  // Writes whatever is pending, right now.
  private flush(): void {
    this.cancelPendingWrite();
    if (!this.persister || !this.persist) return;
    guard(() => localStorage.setItem(LOG_KEY, JSON.stringify(this.log)));
  }

  private cancelPendingWrite(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = null;
  }

  private post(message: Message): void {
    guard(() => this.channel?.postMessage(message));
  }
}

function readPersistFlag(): boolean {
  return guard(() => localStorage.getItem(PERSIST_KEY) === 'true') ?? false;
}

function readStoredLog(): LogEntry[] {
  const raw = guard(() => localStorage.getItem(LOG_KEY));
  if (!raw) return [];
  const parsed = guard(() => JSON.parse(raw) as unknown);
  if (!Array.isArray(parsed)) return [];
  // Anything in storage is untrusted input — an older build's shape, or a hand
  // edit — so keep only what is recognisably an entry.
  return parsed.filter(
    (entry): entry is LogEntry =>
      !!entry &&
      typeof (entry as LogEntry).id === 'string' &&
      typeof (entry as LogEntry).time === 'number' &&
      typeof (entry as LogEntry).message === 'string',
  );
}

// The logger's own failures are the one place with nowhere to report to —
// reporting them here would recurse. localStorage can throw (quota, or storage
// blocked outright in a third-party iframe) and BroadcastChannel can throw on a
// closed channel; neither is worth taking the app down for, so they degrade to a
// console line and the log carries on in memory.
function guard<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    console.error('Diagnostics could not reach browser storage', error);
    return undefined;
  }
}
