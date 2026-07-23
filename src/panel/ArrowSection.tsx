// The Fields tab's view of a selected arrow: move the connected blocks' fields
// across it (copy merges, replace overwrites — in either direction), and
// navigate the viewport to either end. Rendered by FieldsSection when the
// selection is exactly one connector.
//
// The layout speaks the panel's own visual language: each direction is a card
// naming its ends with the vocabulary dots ("● Command → ● Event") over a
// Copy/Replace pair, and each end is a pattern-row-style button for
// navigation. No Mirotone .button here except Retry — the stock button sizes
// itself to its label, which is what made a grid of them ragged.
//
// Same failure discipline as the rest of the tab: a board that couldn't be read
// renders as that failure (with retry), never as "nothing here". Every action
// re-reads the arrow fresh inside the feature, so these buttons act on what the
// board holds at click time, not on what this component rendered.

import './ArrowSection.css';
import { useEffect, useRef, useState } from 'react';
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
import { Dot, type DotKind } from './Dot';

// The same slow self-retry as the fields editor: the failure this retries is
// usually an exhausted credit budget, and a tight loop would spend the very
// thing that ran out.
const RETRY_MS = 15_000;

function title(endpoint: ArrowEndpoint): string {
  return endpoint.name || endpoint.label;
}

// The vocabulary dot for an endpoint: the sticky types map straight through;
// screens and automations reuse the palette's sketch/gear marks; an
// unrecognized element gets a neutral outline dot (rendered inline below).
function dotFor(endpoint: ArrowEndpoint): DotKind | null {
  if (!endpoint.type) return null;
  if (endpoint.type === 'screen') return 'sketch';
  if (endpoint.type === 'automation') return 'gear';
  return endpoint.type;
}

function EndBadge({ endpoint }: { endpoint: ArrowEndpoint }) {
  const dot = dotFor(endpoint);
  return (
    <span className="arrow-move-end" title={title(endpoint)}>
      {dot ? <Dot kind={dot} /> : <span className="dot dot-plain" />}
      <span className="arrow-move-label">{endpoint.label}</span>
      {endpoint.fieldable && <span className="arrow-count">{endpoint.fields.length}</span>}
    </span>
  );
}

export function ArrowSection({ connectorId }: { connectorId: string }) {
  const [info, setInfo] = useState<ArrowInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Which arrow the shown info belongs to. A re-describe of the SAME arrow (a
  // retry, the refresh after a transfer) keeps the current card on screen
  // instead of flashing back to "Reading…"; a different arrow clears it.
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (shownFor.current !== connectorId) {
      shownFor.current = connectorId;
      setInfo(null);
      setStatus(null);
      setLoaded(false);
    }
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

  if (!loaded && !info) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="section-sub">Arrow</p>
        <p className="arrow-note">Reading the arrow…</p>
      </section>
    );
  }

  if (!info) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="section-sub">Arrow</p>
        <p className="arrow-note">This arrow no longer exists on the board.</p>
      </section>
    );
  }

  const start = info.start;
  const end = info.end;

  // Why a transfer that way can't run, or null when it can. Both copy and
  // replace need the same things: two attached, field-capable ends and at
  // least one field on the source (replacing with nothing would be a disguised
  // clear, and copying nothing is a no-op).
  const blocked = (direction: TransferDirection): string | null => {
    const source = direction === 'along' ? start : end;
    const target = direction === 'along' ? end : start;
    if (!source || !target) return 'This arrow is not attached to a block on both ends.';
    if (!source.fieldable) return `This ${source.label.toLowerCase()} can't carry fields.`;
    if (!target.fieldable) return `This ${target.label.toLowerCase()} can't carry fields.`;
    if (source.fields.length === 0) return `${title(source)} has no fields to carry over.`;
    return null;
  };

  // One direction: its ends named with dots, source first, over a Copy/Replace
  // pair. The card always renders — a blocked direction shows why on hover.
  const moveCard = (direction: TransferDirection, source: ArrowEndpoint, target: ArrowEndpoint) => {
    const why = blocked(direction);
    return (
      <div className="arrow-move">
        <div className="arrow-move-ends">
          <EndBadge endpoint={source} />
          <span className="arrow-move-arrow" aria-hidden="true">
            →
          </span>
          <EndBadge endpoint={target} />
        </div>
        <div className="arrow-move-actions">
          <button
            className="arrow-action"
            type="button"
            disabled={working || why !== null}
            title={why ?? `Add ${title(source)}'s fields to ${title(target)} — existing fields are kept`}
            onClick={() => transfer(direction, 'copy')}
          >
            Copy
          </button>
          <button
            className="arrow-action"
            type="button"
            disabled={working || why !== null}
            title={why ?? `Replace ${title(target)}'s fields with ${title(source)}'s`}
            onClick={() => transfer(direction, 'replace')}
          >
            Replace
          </button>
        </div>
      </div>
    );
  };

  const navRow = (endpoint: ArrowEndpoint) => {
    const dot = dotFor(endpoint);
    return (
      <button
        className="arrow-nav-row"
        type="button"
        disabled={working}
        title={`Navigate to ${title(endpoint)}`}
        onClick={() => navigate(endpoint)}
      >
        {dot ? <Dot kind={dot} /> : <span className="dot dot-plain" />}
        <span className="arrow-nav-label">{endpoint.label}</span>
        {endpoint.name && <span className="arrow-nav-name">{endpoint.name}</span>}
        <span className="arrow-nav-go" aria-hidden="true">
          ↗
        </span>
      </button>
    );
  };

  return (
    <section className="section">
      <h2 className="section-title">Fields</h2>
      <p className="section-sub">Arrow</p>

      {start && end ? (
        <>
          <p className="arrow-heading">Move fields</p>
          {moveCard('along', start, end)}
          {moveCard('against', end, start)}
        </>
      ) : (
        <p className="arrow-note">
          Attach both ends of the arrow to blocks to move fields between them.
        </p>
      )}

      {(start || end) && (
        <>
          <p className="arrow-heading">Navigate to</p>
          <div className="arrow-nav">
            {start && navRow(start)}
            {end && navRow(end)}
          </div>
        </>
      )}

      {status && <p className="arrow-status">{status}</p>}
      <p className="footnote">Copy adds the missing fields; Replace overwrites them all.</p>
    </section>
  );
}
