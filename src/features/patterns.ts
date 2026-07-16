// Pattern stamps: the four event-modeling patterns as pre-linked groups.
// Columns step along the timeline; lanes are actors — screens and automations
// (-1), commands & read models (0), events (1).

import { stickyTypeForColor, type BlockType } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import { isHostUnavailable } from '../ports/errors';
import { services } from '../services';
import { connect } from './connectors';
import { createBlock } from './createBlock';
import { absoluteCenter, ensureVisible, viewportCenter } from './helpers';

export type PatternId =
  | 'command'
  | 'view'
  | 'automation'
  | 'translation'
  | 'processor'
  | 'reservation'
  | 'lookup'
  | 'projection';

interface StampNode {
  block: BlockType;
  col: number;
  lane: -1 | 0 | 1;
}

const COL_STEP = 300;
const LANE_STEP = 320;

const PATTERNS: Record<PatternId, { nodes: StampNode[]; links: [number, number][] }> = {
  command: {
    nodes: [
      { block: 'screen', col: 0, lane: -1 },
      { block: 'command', col: 0, lane: 0 },
      { block: 'event', col: 0, lane: 1 },
    ],
    links: [
      [0, 1],
      [1, 2],
    ],
  },
  view: {
    nodes: [
      { block: 'event', col: 0, lane: 1 },
      { block: 'readModel', col: 0, lane: 0 },
      { block: 'screen', col: 0, lane: -1 },
    ],
    links: [
      [0, 1],
      [1, 2],
    ],
  },
  automation: {
    nodes: [
      { block: 'readModel', col: 0, lane: 0 },
      { block: 'automation', col: 1, lane: -1 },
      { block: 'command', col: 2, lane: 0 },
      { block: 'event', col: 2, lane: 1 },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  translation: {
    nodes: [
      { block: 'externalEvent', col: 0, lane: 1 },
      { block: 'automation', col: 1, lane: -1 },
      { block: 'command', col: 2, lane: 0 },
      { block: 'event', col: 2, lane: 1 },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  // Processor TODO-list: a command produces a fact that adds work to a read
  // model acting as the processor's TODO list; the processor (automation) reads
  // it, issues a command, and the resulting event marks the item done.
  processor: {
    nodes: [
      { block: 'command', col: 0, lane: 0 },
      { block: 'event', col: 0, lane: 1 },
      { block: 'readModel', col: 1, lane: 0 },
      { block: 'automation', col: 2, lane: -1 },
      { block: 'command', col: 3, lane: 0 },
      { block: 'event', col: 3, lane: 1 },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 2],
    ],
  },
  // Reservation: a tentative claim that is later confirmed. A command reserves a
  // limited resource (Reserved event), which updates an availability read model;
  // an automation reads it and issues a command to confirm (Confirmed event).
  reservation: {
    nodes: [
      { block: 'command', col: 0, lane: 0 },
      { block: 'event', col: 0, lane: 1 },
      { block: 'readModel', col: 1, lane: 0 },
      { block: 'automation', col: 2, lane: -1 },
      { block: 'command', col: 3, lane: 0 },
      { block: 'event', col: 3, lane: 1 },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
  },
  // Lookup table: a screen backed by one or more read models, each hydrated by
  // its own event. Stamped with two read models to show the "one or more" shape.
  lookup: {
    nodes: [
      { block: 'screen', col: 0.5, lane: -1 },
      { block: 'readModel', col: 0, lane: 0 },
      { block: 'readModel', col: 1, lane: 0 },
      { block: 'event', col: 0, lane: 1 },
      { block: 'event', col: 1, lane: 1 },
    ],
    links: [
      [3, 1],
      [4, 2],
      [1, 0],
      [2, 0],
    ],
  },
  // Projected read model: a command produces an event, which is projected into
  // a read model.
  projection: {
    nodes: [
      { block: 'command', col: 0, lane: 0 },
      { block: 'event', col: 0, lane: 1 },
      { block: 'readModel', col: 1, lane: 0 },
    ],
    links: [
      [0, 1],
      [1, 2],
    ],
  },
};

// If the user has exactly one block of a type this pattern contains selected,
// the stamp anchors on it: that block is reused as the matching node and the
// rest are placed relative to it. A screen's or automation's grouped title
// carries no block metadata, so selecting the pair still yields a single match.
async function findStampAnchor(
  nodes: StampNode[],
): Promise<{ element: CanvasElement; index: number } | null> {
  const { canvas } = services();
  const selection = await canvas.selection();
  const matches: { element: CanvasElement; index: number }[] = [];
  for (const el of selection) {
    const meta = await canvas.getMeta(el.id);
    // A plain (unconverted) sticky has no metadata — fall back to the type its
    // fill color denotes, so a pattern can anchor on it without conversion.
    const type = meta?.type ?? (el.kind === 'card' ? stickyTypeForColor(el.color) : null);
    if (!type) continue;
    const index = nodes.findIndex((node) => node.block === type);
    if (index >= 0) matches.push({ element: el, index });
  }
  return matches.length === 1 ? matches[0] : null;
}

export async function stampPattern(id: PatternId): Promise<CanvasElement[]> {
  const { nodes, links } = PATTERNS[id];
  const anchor = await findStampAnchor(nodes);

  // The grid cell that maps to the origin, and the board point it sits at.
  // Anchored: the matched node, pinned to the selected element. Otherwise: the
  // pattern's mid-column at the view center (the original behavior).
  let origin: { x: number; y: number };
  let originCol: number;
  let originLane: number;
  if (anchor) {
    origin = await absoluteCenter(anchor.element);
    originCol = nodes[anchor.index].col;
    originLane = nodes[anchor.index].lane;
  } else {
    origin = await viewportCenter();
    const cols = nodes.map((n) => n.col);
    originCol = (Math.min(...cols) + Math.max(...cols)) / 2;
    originLane = 0;
  }

  // Reuse the selected element for the anchor node; create the rest relative to
  // it so the pattern lays out around the user's block.
  const items: CanvasElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (anchor && i === anchor.index) {
      items.push(anchor.element);
      continue;
    }
    const node = nodes[i];
    items.push(
      await createBlock(
        node.block,
        origin.x + (node.col - originCol) * COL_STEP,
        origin.y + (node.lane - originLane) * LANE_STEP,
      ),
    );
  }

  for (const [from, to] of links) {
    try {
      await connect(items[from].id, items[to].id);
    } catch (error) {
      // Not every element type accepts links, and the blocks are worth keeping
      // when one refuses. But that reasoning only holds for a refusal: if the
      // board isn't answering, every remaining link fails too and the stamp
      // quietly comes out unlinked. So carry on past a "no", not past silence.
      if (isHostUnavailable(error)) throw error;
      services().diagnostics.report('warn', 'Could not link stamped items', error);
    }
  }

  // The anchor's snapshot may carry frame-relative coords; use its absolute
  // center so the viewport expansion covers the pattern's real footprint.
  const boxes = items.map((item, i) =>
    anchor && i === anchor.index
      ? { x: origin.x, y: origin.y, width: item.width, height: item.height }
      : item,
  );
  await ensureVisible(boxes);
  return items;
}
