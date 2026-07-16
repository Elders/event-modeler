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
  entryAsJson,
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

// Puts text on the clipboard by whichever route this host permits.
//
// navigator.clipboard is the right API and is tried first, but Miro does not
// grant this panel the `clipboard-write` permissions policy, so here it always
// rejects with NotAllowedError (crbug.com/414348233) — and the iframe's
// attributes are Miro's to set, not ours. execCommand is deprecated but is not
// gated by that policy and still copies from a user gesture. The click is that
// gesture, and awaiting the rejection above doesn't cost us it: a microtask
// continuation stays inside the same task's transient activation.
//
// Falling through to the second attempt is not swallowing the first: nothing is
// claimed to have worked, and if the fallback fails too the original blockage is
// what gets reported, being the more useful of the two.
async function copyText(text: string): Promise<void> {
  let blocked: unknown;
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (error) {
    blocked = error;
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // Off-screen but still selectable — display:none or visibility:hidden would
  // make it unselectable and the copy would quietly do nothing.
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    if (!document.execCommand('copy')) {
      throw blocked ?? new Error('The browser refused the copy.');
    }
  } finally {
    area.remove();
  }
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
  const [copied, setCopied] = useState(false);
  const detail = [entry.detail, entry.stack].filter(Boolean).join('\n\n');
  const context = entry.context
    ? Object.entries(entry.context)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' · ')
    : '';

  // Let the confirmation fade on its own, and cancel it if the entry goes away
  // (a Clear while it's showing) rather than setting state on a dead component.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await copyText(entryAsJson(entry));
      setCopied(true);
    } catch (error) {
      // Both routes refused. Say so rather than look like a button that does
      // nothing — which is how we learned the modern API is blocked here at all.
      reportToLog('Could not copy the log entry to the clipboard', error);
    }
  };

  return (
    <li className={`log-entry log-${entry.level}`}>
      {/* Metadata and the action share the top line; the message gets its own,
          full width. It's a sentence — squeezed beside a timestamp, a badge and
          a button it had ~127px and wrapped every time. */}
      <div className="log-head">
        <span className="log-time">{timeOf(entry)}</span>
        <span className={`log-source log-source-${entry.source}`}>{entry.source}</span>
        <button
          className="log-copy"
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Entry copied' : 'Copy this entry as JSON'}
          title="Copy as JSON"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="log-message">{entry.message}</p>
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
