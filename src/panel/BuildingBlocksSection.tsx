// The palette of event-modeling building blocks. Every tile is draggable onto
// the board (Miro fires the drop at the cursor) and also placeable by click.
// Typed blocks place at the view center on click; the two tool tiles
// (specification, swimlanes) run their own features.

import './BuildingBlocksSection.css';
import { useRef } from 'react';
import { BLOCKS, type PaletteKind } from '../domain/vocabulary';
import { createBlockAtCenter } from '../features/createBlock';
import { insertSwimlanes } from '../features/swimlanes';
import { addSpecification } from '../features/specs/create';
import { Swatch } from './Swatch';
import type { Guard } from './useBusyGuard';

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
      placeOnClick: () => createBlockAtCenter(block.type),
    }),
  ),
  {
    kind: 'specification',
    label: 'Specification',
    hint: 'Given · When · Then',
    placeOnClick: addSpecification,
  },
  {
    kind: 'swimlanes',
    label: 'Swimlanes',
    hint: 'three lane guides',
    placeOnClick: insertSwimlanes,
  },
];

export function BuildingBlocksSection({ guard }: { guard: Guard }) {
  // Where the pointer went down on a tile — used to tell a click from a drag.
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <section className="section">
      <h2 className="section-title">Building blocks</h2>
      <p className="section-sub">Drag a tile onto the board — or click to place it</p>
      <div className="tile-grid">
        {TILES.map((tile) => {
          const place = guard(() => tile.placeOnClick());
          return (
            <div
              key={tile.kind}
              className="tile miro-draggable"
              data-block={tile.kind}
              role="button"
              tabIndex={0}
              title="Drag onto the board, or click to place at the center of the view"
              onPointerDown={(e) => {
                downPos.current = { x: e.clientX, y: e.clientY };
              }}
              onClick={(e) => {
                const down = downPos.current;
                if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
                void place();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void place();
              }}
            >
              <Swatch kind={tile.kind} />
              <span className="tile-text">
                <span className="tile-name">{tile.label}</span>
                <span className="tile-hint">{tile.hint}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
