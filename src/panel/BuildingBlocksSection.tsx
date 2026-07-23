// The palette of event-modeling building blocks. Every tile is draggable onto
// the board (Miro fires the drop at the cursor) and also placeable by click.
// Typed blocks place at the view center on click; the two tool tiles
// (specification, swimlanes) run their own features. Two tiles are
// selection-aware on click: Slice wraps the selected elements, and Screen
// converts selected plain images into screens instead of placing a new one.

import './BuildingBlocksSection.css';
import { useEffect, useRef, useState } from 'react';
import { BLOCKS, type PaletteKind } from '../domain/vocabulary';
import { adoptableImageCount, placeOrAdoptScreens } from '../features/adoptImages';
import { createBlockAtCenter } from '../features/createBlock';
import { reportToLog } from '../features/diagnostics';
import { insertChapter } from '../features/chapter';
import { createSliceAroundSelection } from '../features/slices';
import { insertSwimlane } from '../features/swimlane';
import { addSpecification } from '../features/specs/create';
import { Swatch } from './Swatch';
import type { Guard } from './useBusyGuard';
import { useSelection } from './useSelection';

interface PaletteTile {
  kind: PaletteKind;
  label: string;
  hint: string;
  // What a click does (a drag is handled by the board's drop event). For the
  // tool tiles this differs from a drop: clicking a spec can attach it to a
  // selected slice, whereas dragging drops a standalone spec at the cursor.
  placeOnClick: () => Promise<unknown>;
}

const TILES: PaletteTile[] = [
  ...BLOCKS.map(
    (block): PaletteTile => ({
      kind: block.type,
      label: block.label,
      hint: block.hint,
      // Clicking the slice tile wraps the current selection in a padded slice,
      // and clicking the screen tile converts selected plain images (a drag
      // still drops the default element at the cursor); the rest place at the
      // view center.
      placeOnClick:
        block.type === 'slice'
          ? createSliceAroundSelection
          : block.type === 'screen'
            ? placeOrAdoptScreens
            : () => createBlockAtCenter(block.type),
    }),
  ),
  {
    kind: 'specification',
    label: 'Specification',
    hint: 'Given · When · Then',
    placeOnClick: addSpecification,
  },
  {
    kind: 'swimlane',
    label: 'Swimlane',
    hint: 'one lane guide',
    placeOnClick: insertSwimlane,
  },
  {
    kind: 'chapter',
    label: 'Chapter',
    hint: 'groups slices into a context',
    placeOnClick: insertChapter,
  },
];

export function BuildingBlocksSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  // Where the pointer went down on a tile — used to tell a click from a drag.
  const downPos = useRef<{ x: number; y: number } | null>(null);

  // Plain images in the selection switch the Screen tile into convert mode; the
  // count drives its hint. Re-inspected when a panel action finishes (just-
  // converted images stop being plain) and once more after a short settle, since
  // a just-dropped screen can be selected before its metadata write lands.
  const { items: selection } = useSelection();
  const selectionKey = selection.map((item) => item.id).join(',');
  const [adoptable, setAdoptable] = useState(0);
  //
  // `selection` arrives on the free selection:update push, so the only cost here
  // is one 50-credit `getMeta` per selected image. It used to re-read the
  // selection from the board — 500 credits — for a payload it had already been
  // given, twice per selection change.
  useEffect(() => {
    let cancelled = false;
    const inspect = () =>
      void adoptableImageCount(selection)
        .then((count) => {
          if (!cancelled) setAdoptable(count);
        })
        // Supervisor: this only drives the Screen tile's hint, so a failed count
        // leaves the tile in its plain mode rather than breaking the palette —
        // but it says so instead of looking like "no images are selected".
        .catch((error) => reportToLog('Could not count adoptable images', error));
    inspect();
    const settle = window.setTimeout(inspect, 900);
    return () => {
      cancelled = true;
      clearTimeout(settle);
    };
  }, [selectionKey, busy]);

  return (
    <section className="section">
      <h2 className="section-title">Building blocks</h2>
      <p className="section-sub">Drag a tile onto the board — or click to place it</p>
      <div className="tile-grid">
        {TILES.map((tile) => {
          const place = guard(() => tile.placeOnClick());
          const converts = tile.kind === 'screen' && adoptable > 0;
          const hint = converts
            ? adoptable === 1
              ? 'convert selected image'
              : `convert ${adoptable} selected images`
            : tile.hint;
          return (
            <div
              key={tile.kind}
              className={`tile miro-draggable${converts ? ' tile-converts' : ''}`}
              data-block={tile.kind}
              role="button"
              tabIndex={0}
              title={
                converts
                  ? 'Click to convert the selected images into screens; a drag still places a new one'
                  : 'Drag onto the board, or click to place at the center of the view'
              }
              onPointerDown={(e) => {
                downPos.current = { x: e.clientX, y: e.clientY };
              }}
              onClick={(e) => {
                const down = downPos.current;
                if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
                void place();
              }}
              onKeyDown={(e) => {
                // A role="button" is expected to fire on Space as well as Enter;
                // preventDefault stops Space from scrolling the panel instead.
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void place();
                }
              }}
            >
              <Swatch kind={tile.kind} />
              <span className="tile-text">
                <span className="tile-name">{tile.label}</span>
                <span className="tile-hint">{hint}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
