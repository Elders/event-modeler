// Chapter: a section marker on the timeline — a single thick horizontal linking
// arrow (a Miro connector in the default style, recolored) whose editable name
// rides on the line as the connector's own caption, sitting above it. One
// object, no group. It carries no metadata or fields: a structural annotation,
// not an event-modeling block. The arrow's endpoints are free positions (not
// attached to items), so the completeness check — which only looks at
// item-to-item connectors — ignores it.

import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { ensureVisible, viewportCenter } from './helpers';

export const CHAPTER_WIDTH = 420;
const CHAPTER_COLOR = '#61DEFF';
const CHAPTER_TEXT_COLOR = '#000000';
const CHAPTER_THICKNESS = 16;
const CHAPTER_FONT = 48;

export async function insertChapter(
  at?: { x: number; y: number },
  title = 'Chapter',
): Promise<CanvasElement> {
  const { canvas } = services();
  const { x, y } = at ?? (await viewportCenter());
  const half = CHAPTER_WIDTH / 2;

  const arrow = await canvas.createArrow({
    start: { x: x - half, y },
    end: { x: x + half, y },
    color: CHAPTER_COLOR,
    thickness: CHAPTER_THICKNESS,
    text: title,
    textColor: CHAPTER_TEXT_COLOR,
    fontSize: CHAPTER_FONT,
  });

  await ensureVisible([
    { x, y: y - CHAPTER_FONT / 2, width: CHAPTER_WIDTH, height: CHAPTER_FONT * 2 },
  ]);
  return arrow;
}
