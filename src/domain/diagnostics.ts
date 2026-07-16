// The diagnostic log: what the tool records when something fails. Pure domain —
// no platform reference, no transport — so it ports unchanged to any host.
//
// This exists because failures used to be invisible. The adapters swallowed
// every SDK error and returned a plausible-looking value in its place (see
// DECISIONS.md), so a rate-limited board looked identical to an empty one. The
// rule now is that a failure is reported, never fabricated into an answer; this
// module is the shape of that report.

export type LogLevel = 'warn' | 'error';

// Which page produced the entry. The two run as separate iframes with separate
// consoles, and the board script's failures are the ones nobody was seeing, so
// every entry says where it came from.
export type LogSource = 'board' | 'panel';

export interface LogEntry {
  id: string;
  time: number; // epoch ms
  level: LogLevel;
  source: LogSource;
  // What we were attempting, in our words ("Completeness check failed").
  message: string;
  // The failure's own message ("The API rate limit was exceeded...").
  detail?: string;
  stack?: string;
  // Anything that makes the entry actionable: the element id, the app-data key.
  context?: Record<string, string | number | boolean | null>;
}

// How many entries a page keeps. Bounded because the board script runs for the
// whole session and a rate-limit storm produces an entry every few seconds.
export const LOG_CAP = 500;

export function newLogId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// The readable parts of an unknown throw. Non-Error throws are stringified
// rather than dropped — an SDK that rejects with a plain object still has to
// show up in the log.
export function describeError(error: unknown): { detail?: string; stack?: string } {
  if (error === undefined || error === null) return {};
  if (error instanceof Error) {
    return { detail: error.message, stack: error.stack };
  }
  if (typeof error === 'object') {
    try {
      return { detail: JSON.stringify(error) };
    } catch {
      // A circular or unserializable object still has to be reported, so fall
      // through to String() rather than lose the entry.
      return { detail: String(error) };
    }
  }
  return { detail: String(error) };
}

// Merges two entry lists into one ordered, deduplicated, capped log. Both pages
// hold every entry (their own plus the other's, over the transport), so the same
// id can arrive twice — from the live broadcast and again from a replay.
export function mergeEntries(existing: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry] as const));
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => a.time - b.time).slice(-LOG_CAP);
}

// One entry, as it appears in an export. The id is left out: it exists to
// deduplicate entries arriving over the transport, and means nothing to whoever
// reads the log.
function exportable(entry: LogEntry): Record<string, unknown> {
  return {
    time: new Date(entry.time).toISOString(),
    level: entry.level,
    source: entry.source,
    message: entry.message,
    ...(entry.detail ? { detail: entry.detail } : {}),
    ...(entry.context ? { context: entry.context } : {}),
    ...(entry.stack ? { stack: entry.stack } : {}),
  };
}

// The export handed to a human or pasted back to a developer. JSON, so the
// structure survives: timestamps stay machine-readable and stacks stay intact.
export function formatLogExport(entries: LogEntry[], exportedAt: number): string {
  return JSON.stringify(
    {
      exportedAt: new Date(exportedAt).toISOString(),
      count: entries.length,
      entries: entries.map(exportable),
    },
    null,
    2,
  );
}

// A single entry, for copying one failure out of the list. No envelope: the
// `exportedAt`/`count` wrapper describes a whole log, and wrapping one entry in
// it would only be noise to paste somewhere.
export function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(exportable(entry), null, 2);
}

// The filename for an export, timestamped so successive exports don't collide.
export function logExportFilename(exportedAt: number): string {
  const stamp = new Date(exportedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `event-modeler-log-${stamp}.json`;
}
