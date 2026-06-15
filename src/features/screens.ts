// Screens: an editable title above a content image, grouped so they move as
// one. Two creation paths — a blank sketch placeholder to draw over, or an
// uploaded capture.

import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { addTitleAbove, viewportCenter } from './helpers';

export const SCREEN_WIDTH = 420;
export const SCREEN_HEIGHT = 320;

// The blank sketch surface, shipped inline as an SVG so that every screen is
// the same kind of pair: title text + image (placeholder or uploaded capture).
const SKETCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}" viewBox="0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}"><rect x="2" y="2" width="${SCREEN_WIDTH - 4}" height="${SCREEN_HEIGHT - 4}" rx="6" fill="#ffffff" stroke="#444444" stroke-width="2" stroke-dasharray="10 6"/></svg>`;
const SKETCH_PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(SKETCH_SVG)}`;

export async function createSketchScreen(x: number, y: number): Promise<CanvasElement> {
  const { canvas } = services();
  const image = await canvas.createImage({ url: SKETCH_PLACEHOLDER_URL, x, y, width: SCREEN_WIDTH });
  await canvas.setMeta(image.id, { type: 'screen' });
  await canvas.settle(image.id, x, y);
  await addTitleAbove('Screen', image, x, y);
  return image;
}

export async function placeScreenImage(dataUrl: string, name = 'Screen'): Promise<CanvasElement> {
  const { canvas } = services();
  const { x, y } = await viewportCenter();
  const image = await canvas.createImage({ url: dataUrl, x, y, width: 600 });
  await canvas.setMeta(image.id, { type: 'screen' });
  await canvas.settle(image.id, x, y);
  await addTitleAbove(name, image, x, y);
  return image;
}
