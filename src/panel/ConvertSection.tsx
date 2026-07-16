// Adopts plain frames into typed model structures. Reacts to the board
// selection (mirroring FieldsSection): a plain frame offers a slice/spec choice.
// (Sticky notes need no conversion — their fill color already denotes their block
// type.) Conversion is a deliberate transform on the selection, so it lives in
// the panel rather than as an on-canvas affordance (there's nothing to anchor one
// to — plain frames aren't tracked).

import './ConvertSection.css';
import { useEffect, useState } from 'react';
import { convertFrames, inspectSelection, type ConvertTargets } from '../features/convert';
import { reportToLog } from '../features/diagnostics';
import type { Guard } from './useBusyGuard';
import { useSelection } from './useSelection';

const EMPTY: ConvertTargets = { frames: 0 };

export function ConvertSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const { items: selection } = useSelection();
  const selectionKey = selection.map((item) => item.id).join(',');
  const [targets, setTargets] = useState<ConvertTargets>(EMPTY);

  // Re-inspect whenever the selection changes or a panel action finishes. A
  // just-placed slice/spec is auto-selected before its registry write lands, so
  // it would momentarily look like a plain frame; the `busy` dependency re-checks
  // once a panel placement completes, and the delayed re-check covers a drag
  // placement (which doesn't run through the busy guard).
  //
  // `selection` comes from the selection:update push and is free, so the only
  // cost left here is the two registry reads. This used to call
  // `board.getSelection()` — 500 credits — to fetch what the hook above had
  // already been handed, twice per selection change.
  useEffect(() => {
    let cancelled = false;
    const inspect = () =>
      void inspectSelection(selection)
        .then((next) => {
          if (!cancelled) setTargets(next);
        })
        // Supervisor: a failed inspection leaves the section showing its "select
        // plain frames" prompt, so it has to be reported — otherwise a board that
        // wouldn't answer looks like a selection with nothing to convert.
        .catch((error) => reportToLog('Could not inspect the selection for conversion', error));
    inspect();
    const settle = window.setTimeout(inspect, 900);
    return () => {
      cancelled = true;
      clearTimeout(settle);
    };
  }, [selectionKey, busy]);

  // Converting doesn't change the selection — the frames stay selected, they are
  // just registered now — so the same items re-inspect correctly, and the
  // registry reads inside are what notice they've been taken.
  const run = (action: () => Promise<unknown>) =>
    guard(async () => {
      await action();
      setTargets(await inspectSelection(selection));
    });

  const nothing = targets.frames === 0;

  return (
    <section className="section">
      <h2 className="section-title">Convert</h2>
      {nothing ? (
        <p className="section-sub">
          Select plain frames to adopt them as slices or specs. (Sticky notes don't need
          converting — their color already sets their block type.)
        </p>
      ) : (
        <div className="convert-actions">
          {targets.frames > 0 && (
            <div className="convert-frames">
              <p className="convert-frames-label">
                Convert {targets.frames} {targets.frames === 1 ? 'frame' : 'frames'} to
              </p>
              <div className="convert-frame-buttons">
                <button
                  className="button button-small"
                  type="button"
                  onClick={run(() => convertFrames('slice'))}
                >
                  Slice
                </button>
                <button
                  className="button button-small"
                  type="button"
                  onClick={run(() => convertFrames('spec'))}
                >
                  Spec
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
