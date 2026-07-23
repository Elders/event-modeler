// The Fields tab's view of a selected arrow: move the connected blocks' fields
// across it (copy merges, replace overwrites — in either direction), and
// navigate the viewport to either end. Rendered by FieldsSection when the
// selection is exactly one connector.
//
// Same failure discipline as the rest of the tab: a board that couldn't be read
// renders as that failure (with retry), never as "nothing here". Every action
// re-reads the arrow fresh inside the feature, so these buttons act on what the
// board holds at click time, not on what this component rendered.

import './ArrowSection.css';
import { useEffect, useState } from 'react';
import {
  describeArrow,
  navigateToEndpoint,
  transferFields,
  type ArrowEndpoint,
  type ArrowInfo,
  type TransferDirection,
  type TransferMode,
} from '../features/arrow';
import { failureReason, reportToLog } from '../features/diagnostics';
import { isBoardRateLimited } from '../features/hostStatus';

// The same slow self-retry as the fields editor: the failure this retries is
// usually an exhausted credit budget, and a tight loop would spend the very
// thing that ran out.
const RETRY_MS = 15_000;

function title(endpoint: ArrowEndpoint): string {
  return endpoint.name || endpoint.label;
}

// One side of the header line: the block label, with its field count when it
// can carry fields at all.
function sideText(endpoint: ArrowEndpoint | null): string {
  if (!endpoint) return 'unattached';
  return endpoint.fieldable ? `${endpoint.label} (${endpoint.fields.length})` : endpoint.label;
}

// A navigate button's target: the block type, plus the block's own name when
// both ends carry the same label and the type alone can't tell them apart.
function navText(endpoint: ArrowEndpoint, other: ArrowEndpoint | null): string {
  const base = endpoint.label.toLowerCase();
  if (other && other.label === endpoint.label && endpoint.name) {
    return `${base} “${endpoint.name}”`;
  }
  return base;
}

export function ArrowSection({ connectorId }: { connectorId: string }) {
  const [info, setInfo] = useState<ArrowInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    void describeArrow(connectorId)
      .then((described) => {
        if (cancelled) return;
        setInfo(described);
        setFailure(null);
        setLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        reportToLog('Could not read the selected arrow', error);
        setInfo(null);
        setFailure(failureReason(error));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [connectorId, attempt]);

  // Retry a failed read on its own, stood down while the board is asking to be
  // left alone — mirroring the fields editor's loop.
  useEffect(() => {
    if (!failure) return;
    const timer = window.setInterval(() => {
      if (isBoardRateLimited()) return;
      setAttempt((n) => n + 1);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [failure]);

  const transfer = (direction: TransferDirection, mode: TransferMode) => {
    setWorking(true);
    setStatus(null);
    void transferFields(connectorId, direction, mode)
      .then((outcome) => {
        setStatus(outcome.message);
        // Re-describe so the counts and button states reflect the write.
        setAttempt((n) => n + 1);
      })
      .catch((error) => {
        reportToLog('Could not move fields across the arrow', error);
        setStatus(failureReason(error));
      })
      .finally(() => setWorking(false));
  };

  const navigate = (endpoint: ArrowEndpoint) => {
    setWorking(true);
    setStatus(null);
    void navigateToEndpoint(endpoint)
      .then((found) => {
        if (!found) setStatus(`${title(endpoint)} is no longer on the board.`);
      })
      .catch((error) => {
        reportToLog('Could not navigate to the connected element', error);
        setStatus(failureReason(error));
      })
      .finally(() => setWorking(false));
  };

  if (failure) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="arrow-failure">Couldn't read the arrow, so its tools aren't shown.</p>
        <p className="arrow-failure-reason">{failure}</p>
        <button
          className="button button-small w-full"
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </button>
        <p className="footnote">Retrying on its own. See the Console tab.</p>
      </section>
    );
  }

  if (!loaded) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="section-sub">Reading the arrow…</p>
      </section>
    );
  }

  if (!info) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="section-sub">This arrow no longer exists on the board.</p>
      </section>
    );
  }

  const start = info.start;
  const end = info.end;

  // Why a transfer that way can't run, or null when it can. Both copy and
  // replace need the same things: two attached, field-capable ends and at least
  // one field on the source (replacing with nothing would be a disguised
  // clear, and copying nothing is a no-op).
  const blocked = (direction: TransferDirection): string | null => {
    const source = direction === 'along' ? start : end;
    const target = direction === 'along' ? end : start;
    if (!source || !target) return 'This arrow is not attached to a block on both ends.';
    if (!source.fieldable) return `A ${source.label.toLowerCase()} can't carry fields.`;
    if (!target.fieldable) return `A ${target.label.toLowerCase()} can't carry fields.`;
    if (source.fields.length === 0) return `${title(source)} has no fields to carry over.`;
    return null;
  };

  const transferButton = (
    text: string,
    direction: TransferDirection,
    mode: TransferMode,
    describe: string,
  ) => {
    const why = blocked(direction);
    return (
      <button
        className="button button-small"
        type="button"
        disabled={working || why !== null}
        title={why ?? describe}
        onClick={() => transfer(direction, mode)}
      >
        {text}
      </button>
    );
  };

  return (
    <section className="section">
      <h2 className="section-title">Fields</h2>
      <p className="section-sub arrow-ends" title={[start, end].map((e) => (e ? title(e) : 'unattached')).join(' → ')}>
        Arrow — {sideText(start)} → {sideText(end)}
      </p>

      <div className="arrow-transfer">
        {transferButton(
          'Copy →',
          'along',
          'copy',
          `Add the ${start?.label.toLowerCase() ?? 'source'}'s fields to the ${end?.label.toLowerCase() ?? 'target'}`,
        )}
        {transferButton(
          'Copy ←',
          'against',
          'copy',
          `Add the ${end?.label.toLowerCase() ?? 'source'}'s fields to the ${start?.label.toLowerCase() ?? 'target'}`,
        )}
        {transferButton(
          'Replace →',
          'along',
          'replace',
          `Replace the ${end?.label.toLowerCase() ?? 'target'}'s fields with the ${start?.label.toLowerCase() ?? 'source'}'s`,
        )}
        {transferButton(
          'Replace ←',
          'against',
          'replace',
          `Replace the ${start?.label.toLowerCase() ?? 'target'}'s fields with the ${end?.label.toLowerCase() ?? 'source'}'s`,
        )}
      </div>

      <div className="arrow-nav">
        {start && (
          <button
            className="button button-small w-full"
            type="button"
            disabled={working}
            title={title(start)}
            onClick={() => navigate(start)}
          >
            Navigate to {navText(start, end)}
          </button>
        )}
        {end && (
          <button
            className="button button-small w-full"
            type="button"
            disabled={working}
            title={title(end)}
            onClick={() => navigate(end)}
          >
            Navigate to {navText(end, start)}
          </button>
        )}
      </div>

      {status && <p className="arrow-status">{status}</p>}
      <p className="footnote">Copy adds the missing fields; Replace overwrites them all.</p>
    </section>
  );
}
