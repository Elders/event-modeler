// Dispatcher: maps a block type from the palette to its feature use-case.

import type { BlockType } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import { createAutomation } from './automation';
import { viewportCenter } from './helpers';
import { createSketchScreen } from './screens';
import { createSlice } from './slices';
import { createSticky } from './stickies';

export async function createBlock(
  type: BlockType,
  x: number,
  y: number,
  label?: string,
): Promise<CanvasElement> {
  if (type === 'automation') return createAutomation(x, y, label);
  if (type === 'screen') return createSketchScreen(x, y, label);
  if (type === 'slice') return createSlice(x, y);
  // The three branches above narrow `type` to the sticky-card types here.
  return createSticky(type, x, y, label);
}

export async function createBlockAtCenter(type: BlockType): Promise<CanvasElement> {
  const { x, y } = await viewportCenter();
  return createBlock(type, x, y);
}
