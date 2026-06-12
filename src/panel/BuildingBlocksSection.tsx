// The draggable palette of event-modeling building blocks.

import './BuildingBlocksSection.css';
import { useRef } from 'react';
import { BLOCKS } from '../blocks';
import { createBlockAtCenter } from '../features/createBlock';
import { Swatch } from './Swatch';
import type { Guard } from './useBusyGuard';

export function BuildingBlocksSection({ guard }: { guard: Guard }) {
  // Where the pointer went down on a tile — used to tell a click from a drag.
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <section className="section">
      <h2 className="section-title">Building blocks</h2>
      <p className="section-sub">Drag a tile onto the board — or click to place it</p>
      <div className="tile-grid">
        {BLOCKS.map((block) => {
          const place = guard(() => createBlockAtCenter(block.type));
          return (
            <div
              key={block.type}
              className="tile miro-draggable"
              data-block={block.type}
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
              <Swatch type={block.type} />
              <span className="tile-text">
                <span className="tile-name">{block.label}</span>
                <span className="tile-hint">{block.hint}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
