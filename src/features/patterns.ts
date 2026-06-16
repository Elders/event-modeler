// Pattern stamps: the four event-modeling patterns as pre-linked groups.
// Columns step along the timeline; lanes are screens (-1), commands & read
// models (0), events (1).

import type { BlockType } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import { connect } from './connectors';
import { createBlock } from './createBlock';
import { ensureVisible, viewportCenter } from './helpers';

export type PatternId = 'command' | 'view' | 'automation' | 'translation';

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
      { block: 'automation', col: 1, lane: 0 },
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
      { block: 'automation', col: 1, lane: 0 },
      { block: 'command', col: 2, lane: 0 },
      { block: 'event', col: 2, lane: 1 },
    ],
    links: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
};

export async function stampPattern(id: PatternId): Promise<CanvasElement[]> {
  const { x: cx, y: cy } = await viewportCenter();
  const { nodes, links } = PATTERNS[id];
  const cols = nodes.map((n) => n.col);
  const midCol = (Math.min(...cols) + Math.max(...cols)) / 2;

  const items: CanvasElement[] = [];
  for (const node of nodes) {
    items.push(
      await createBlock(
        node.block,
        cx + (node.col - midCol) * COL_STEP,
        cy + node.lane * LANE_STEP,
      ),
    );
  }
  for (const [from, to] of links) {
    try {
      await connect(items[from].id, items[to].id);
    } catch (error) {
      // Not every element type accepts links; keep the blocks regardless.
      console.warn('Could not link stamped items', error);
    }
  }
  await ensureVisible(items);
  return items;
}
