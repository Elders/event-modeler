// Adopts plain board items into typed model elements. Reacts to the board
// selection (mirroring FieldsSection): plain sticky notes get a single
// convert-by-color action, plain frames offer a slice/spec choice. Conversion
// is a deliberate transform on the selection, so it lives in the panel rather
// than as an on-canvas affordance (there's nothing to anchor one to — plain
// items aren't tracked).

import './ConvertSection.css';
import { useEffect, useState } from 'react';
import {
  convertFrames,
  convertStickies,
  inspectSelection,
  type ConvertTargets,
} from '../features/convert';
import type { Guard } from './useBusyGuard';
import { useSelection } from './useSelection';

const EMPTY: ConvertTargets = { stickies: 0, frames: 0 };

export function ConvertSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const selection = useSelection();
  const selectionKey = selection.map((item) => item.id).join(',');
  const [targets, setTargets] = useState<ConvertTargets>(EMPTY);

  // Re-inspect whenever the selection changes or a panel action finishes. A
  // just-placed slice/spec is auto-selected before its registry write lands, so
  // it would momentarily look like a plain frame; the `busy` dependency re-checks
  // once a panel placement completes, and the delayed re-check covers a drag
  // placement (which doesn't run through the busy guard).
  useEffect(() => {
    let cancelled = false;
    const inspect = () =>
      void inspectSelection().then((next) => {
        if (!cancelled) setTargets(next);
      });
    inspect();
    const settle = window.setTimeout(inspect, 900);
    return () => {
      cancelled = true;
      clearTimeout(settle);
    };
  }, [selectionKey, busy]);

  const run = (action: () => Promise<unknown>) =>
    guard(async () => {
      await action();
      setTargets(await inspectSelection());
    });

  const nothing = targets.stickies === 0 && targets.frames === 0;

  return (
    <section className="section">
      <h2 className="section-title">Convert</h2>
      {nothing ? (
        <p className="section-sub">
          Select plain sticky notes or frames to adopt them as typed blocks, slices, or specs.
        </p>
      ) : (
        <div className="convert-actions">
          {targets.stickies > 0 && (
            <button
              className="button button-small w-full"
              type="button"
              onClick={run(convertStickies)}
            >
              Convert {targets.stickies} sticky {targets.stickies === 1 ? 'note' : 'notes'} by color
            </button>
          )}
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
