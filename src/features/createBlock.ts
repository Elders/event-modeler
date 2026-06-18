// Dispatcher: maps a palette item to its feature use-case. Typed blocks go to
// their block creators; the two tool tiles (specification, swimlanes) go to
// their own features, placed at the drop point.

import type { BlockType, PaletteKind } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import { createAutomation } from './automation';
import { insertChapter } from './chapter';
import { viewportCenter } from './helpers';
import { createSketchScreen } from './screens';
import { createSlice } from './slices';
import { createSpecification } from './specs/create';
import { createSticky } from './stickies';
import { insertSwimlane } from './swimlane';

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

// Places any palette item at an absolute point (used by the drop handler).
// Dragged specifications and swimlanes land at the drop point; a dragged spec
// is standalone (the slice-attaching behavior stays on the click/“+” paths).
export async function placePaletteItem(kind: PaletteKind, x: number, y: number): Promise<void> {
  if (kind === 'specification') {
    await createSpecification(null, { x, y });
    return;
  }
  if (kind === 'swimlane') {
    await insertSwimlane({ x, y });
    return;
  }
  if (kind === 'chapter') {
    await insertChapter({ x, y });
    return;
  }
  await createBlock(kind, x, y);
}
