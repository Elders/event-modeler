// Dispatcher: maps a block type from the palette to its feature component.

import type { BlockType } from '../blocks';
import { viewportCenter } from '../miro/helpers';
import { createAutomation } from './automation';
import { createSketchScreen } from './screens';
import { createSlice } from './slices';
import { createSticky } from './stickies';

export async function createBlock(type: BlockType, x: number, y: number) {
  if (type === 'automation') return createAutomation(x, y);
  if (type === 'screen') return createSketchScreen(x, y);
  if (type === 'slice') return createSlice(x, y);
  return createSticky(type, x, y);
}

export async function createBlockAtCenter(type: BlockType) {
  const { x, y } = await viewportCenter();
  return createBlock(type, x, y);
}
