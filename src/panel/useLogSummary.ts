// The log, reduced to what the tab bar needs to show a dot: is there anything in
// it, and is any of it an error.
//
// The Console tab is only useful if you know to open it, and the failures it
// exists for happen on the board page with the panel closed — so nothing else
// would ever tell you they occurred.

import { useEffect, useState } from 'react';
import { logEntries, subscribeLog, type LogEntry, type LogLevel } from '../features/diagnostics';

export interface LogSummary {
  count: number;
  // The most severe level present, or null when the log is empty.
  worst: LogLevel | null;
}

function summarize(entries: LogEntry[]): LogSummary {
  if (entries.length === 0) return { count: 0, worst: null };
  return {
    count: entries.length,
    worst: entries.some((entry) => entry.level === 'error') ? 'error' : 'warn',
  };
}

export function useLogSummary(): LogSummary {
  const [summary, setSummary] = useState<LogSummary>(() => summarize(logEntries()));
  useEffect(() => {
    // Re-read on mount as well as subscribing: a replay from the board page can
    // land between the initial state and this effect.
    setSummary(summarize(logEntries()));
    return subscribeLog((entries) => setSummary(summarize(entries)));
  }, []);
  return summary;
}
