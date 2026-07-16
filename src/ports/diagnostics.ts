// The Diagnostics port: where a failure goes once it has been caught by the one
// layer entitled to catch it. The host decides how to record and surface it.
//
// Only two kinds of caller report here. A supervisor — the boundary around a
// background loop, which must not let one bad tick kill its timer — reports the
// tick it abandoned. And a user-facing action reports what it could not do.
// Adapters do NOT report: they propagate, so the caller can tell a failure from
// an answer. That is the whole point of the port existing.

import type { LogEntry, LogLevel } from '../domain/diagnostics';

export interface Diagnostics {
  // Records a failure. Never throws and never returns a promise: reporting sits
  // in catch blocks and finally clauses, where a second failure has nowhere to
  // go and awaiting would change the caller's control flow.
  report(
    level: LogLevel,
    message: string,
    error?: unknown,
    context?: Record<string, string | number | boolean | null>,
  ): void;

  // The full log this page knows about, oldest first — its own entries and any
  // the other page has broadcast.
  entries(): LogEntry[];

  // Calls back whenever the log changes, with the whole log. Returns an
  // unsubscribe function.
  subscribe(handler: (entries: LogEntry[]) => void): () => void;

  clear(): void;

  // Whether the log outlives a page reload. Off by default: the log is a
  // troubleshooting tool, not a record the tool keeps on the user's behalf.
  persisted(): boolean;
  setPersisted(on: boolean): void;
}
