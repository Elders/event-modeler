// The Console tab: every failure the tool recorded, on either page.
//
// It exists because failures used to be invisible. The board script has no UI
// and runs with the panel closed, so its housekeeping and completeness failures
// only ever reached a devtools console nobody had open — which is how a
// rate-limited board spent an hour looking like an empty one. Entries reach here
// from both pages over the diagnostics channel.

import './ConsoleSection.css';
import { useEffect, useState } from 'react';
import {
  clearLog,
  exportLog,
  logEntries,
  logPersisted,
  reportToLog,
  setLogPersisted,
  subscribeLog,
  type LogEntry,
} from '../features/diagnostics';

function timeOf(entry: LogEntry): string {
  return new Date(entry.time).toLocaleTimeString(undefined, { hour12: false });
}

// Hands the log to the user as a file. The panel owns the only DOM in the app,
// so the save happens here rather than behind the use-case.
function save(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoking immediately can cancel the download in some browsers; let the
    // click be dispatched first. Always revoke, even if the click threw.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function Entry({ entry }: { entry: LogEntry }) {
  const [open, setOpen] = useState(false);
  const detail = [entry.detail, entry.stack].filter(Boolean).join('\n\n');
  const context = entry.context
    ? Object.entries(entry.context)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' · ')
    : '';

  return (
    <li className={`log-entry log-${entry.level}`}>
      <div className="log-head">
        <span className="log-time">{timeOf(entry)}</span>
        <span className={`log-source log-source-${entry.source}`}>{entry.source}</span>
        <span className="log-message">{entry.message}</span>
      </div>
      {entry.detail && <p className="log-detail">{entry.detail}</p>}
      {context && <p className="log-context">{context}</p>}
      {detail && (
        <>
          <button className="log-toggle" type="button" onClick={() => setOpen(!open)}>
            {open ? 'Hide details' : 'Show details'}
          </button>
          {open && <pre className="log-stack">{detail}</pre>}
        </>
      )}
    </li>
  );
}

export function ConsoleSection() {
  const [entries, setEntries] = useState<LogEntry[]>(() => logEntries());
  const [persist, setPersist] = useState<boolean>(() => logPersisted());

  useEffect(() => {
    // Re-read on mount as well as subscribing: a replay from the board page can
    // land between the initial state and this effect.
    setEntries(logEntries());
    return subscribeLog(setEntries);
  }, []);

  const togglePersist = (on: boolean) => {
    setPersist(on);
    setLogPersisted(on);
  };

  const download = () => {
    try {
      const { filename, content } = exportLog();
      save(filename, content);
    } catch (error) {
      // The panel is a third-party iframe; a blocked download must say so rather
      // than look like a dead button — and it lands in the list being read.
      reportToLog('Could not export the log', error);
    }
  };

  return (
    <section className="section">
      <h2 className="section-title">Console</h2>
      <p className="section-sub">
        Failures recorded on the board script and this panel. Export this when something needs
        troubleshooting.
      </p>

      <div className="log-actions">
        <button
          className="button button-small"
          type="button"
          onClick={download}
          disabled={entries.length === 0}
        >
          Export
        </button>
        <button
          className="button button-small"
          type="button"
          onClick={() => clearLog()}
          disabled={entries.length === 0}
        >
          Clear
        </button>
        <label className="log-persist">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => togglePersist(e.target.checked)}
          />
          Keep after refresh
        </label>
      </div>

      {entries.length === 0 ? (
        <p className="footnote">Nothing recorded. Failures show up here as they happen.</p>
      ) : (
        <ul className="log-list">
          {entries.map((entry) => (
            <Entry key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}
