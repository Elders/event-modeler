// Screens: an editable title above a content image, grouped so they move as
// one. A blank sketch placeholder to draw over, placed from the Screen block.

import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { addTitleAbove } from './helpers';

export const SCREEN_WIDTH = 420;
export const SCREEN_HEIGHT = 320;

// The blank sketch surface, shipped inline as an SVG so that every screen is
// the same kind of pair: title text + image (placeholder or uploaded capture).
const SKETCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_WIDTH}" height="${SCREEN_HEIGHT}" viewBox="0 0 ${SCREEN_WIDTH} ${SCREEN_HEIGHT}"><rect x="2" y="2" width="${SCREEN_WIDTH - 4}" height="${SCREEN_HEIGHT - 4}" rx="6" fill="#ffffff" stroke="#444444" stroke-width="2" stroke-dasharray="10 6"/></svg>`;
const SKETCH_PLACEHOLDER_URL = `data:image/svg+xml;base64,${btoa(SKETCH_SVG)}`;

// The shared screen builder: an image tagged as a screen, settled, with an
// editable title grouped above it. The image is either the sketch placeholder or
// a real capture (a Figma frame render) — every screen is the same kind of pair.
async function createScreen(
  x: number,
  y: number,
  title: string,
  url: string,
): Promise<CanvasElement> {
  const { canvas } = services();
  const image = await canvas.createImage({ url, x, y, width: SCREEN_WIDTH });
  await canvas.setMeta(image.id, { type: 'screen' });
  await canvas.settle(image.id, x, y);
  await addTitleAbove(title, image, x, y);
  return image;
}

// A blank screen to draw over (the palette Screen tile).
export async function createSketchScreen(
  x: number,
  y: number,
  title = 'Screen',
): Promise<CanvasElement> {
  return createScreen(x, y, title, SKETCH_PLACEHOLDER_URL);
}

// A screen showing a real render — the host fetches and stores the URL at
// creation, so a temporary Figma render URL is fine (the Figma import path).
export async function createScreenFromImage(
  x: number,
  y: number,
  title: string,
  url: string,
): Promise<CanvasElement> {
  return createScreen(x, y, title, url);
}
