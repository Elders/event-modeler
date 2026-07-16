// The diagnostics use-case: what the Console tab does, expressed against the
// Diagnostics port so the panel never reaches for an adapter.
//
// Export returns the bytes and a filename rather than saving them itself —
// handing a file to the user is the UI's job, and the panel is the only layer
// that owns a DOM to do it with.

import {
  describeError,
  formatLogEntry,
  formatLogExport,
  logExportFilename,
  type LogEntry,
} from '../domain/diagnostics';
import { services } from '../services';

export type { LogEntry, LogLevel, LogSource } from '../domain/diagnostics';

// The readable reason, for UI that has to explain why something isn't shown.
export function failureReason(error: unknown): string {
  return describeError(error).detail ?? 'Unknown error';
}

// Newest first: a log is read from the most recent failure backwards.
export function logEntries(): LogEntry[] {
  return [...services().diagnostics.entries()].reverse();
}

// Calls back with the newest-first log whenever it changes. Returns an
// unsubscribe function.
export function subscribeLog(handler: (entries: LogEntry[]) => void): () => void {
  return services().diagnostics.subscribe((entries) => handler([...entries].reverse()));
}

export function clearLog(): void {
  services().diagnostics.clear();
}

export function logPersisted(): boolean {
  return services().diagnostics.persisted();
}

export function setLogPersisted(on: boolean): void {
  services().diagnostics.setPersisted(on);
}

// The log as a file, oldest first — reading a failure's build-up forwards is
// what a troubleshooter wants, which is the opposite of the on-screen order.
export function exportLog(): { filename: string; content: string } {
  const now = Date.now();
  return {
    filename: logExportFilename(now),
    content: formatLogExport(services().diagnostics.entries(), now),
  };
}

// One entry as JSON, for copying a single failure out of the list.
export function entryAsJson(entry: LogEntry): string {
  return formatLogEntry(entry);
}

// Reports a failure the panel itself hit. Features and supervisors call the port
// through their own modules; this is here so the panel has a door to it too.
export function reportToLog(message: string, error?: unknown): void {
  services().diagnostics.report('error', message, error);
}
