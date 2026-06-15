// Sticky-card blocks: events, commands, read models, external events, errors.
// They map onto the conventional event-modeling palette (see domain/vocabulary).

import { STICKY_COLORS, STICKY_LABEL, type StickyBlockType } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';

export const STICKY_WIDTH = 200;

export async function createSticky(
  type: StickyBlockType,
  x: number,
  y: number,
): Promise<CanvasElement> {
  const { canvas } = services();
  const card = await canvas.createCard({
    x,
    y,
    width: STICKY_WIDTH,
    content: STICKY_LABEL[type],
    color: STICKY_COLORS[type],
  });
  await canvas.setMeta(card.id, { type });
  await canvas.settle(card.id, x, y);
  return card;
}
