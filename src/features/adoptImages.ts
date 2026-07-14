// Adopting plain images — ones the user placed with the host's own tools,
// carrying no model metadata — as screens: the image gains the screen type tag
// and the grouped editable title above it, making it indistinguishable from a
// palette-placed screen (the Fields editor, pattern anchoring, and connectors
// all read the tag). Drives the Screen tile's contextual click: with plain
// images selected the tile converts them; otherwise it places a fresh sketch.

import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { createBlockAtCenter } from './createBlock';
import { absoluteCenter, addTitleAbove } from './helpers';

// Plain images in the selection: image elements carrying no tool metadata
// (screens, automation gears, and the on-canvas buttons are all tagged).
async function adoptableImages(selection: CanvasElement[]): Promise<CanvasElement[]> {
  const { canvas } = services();
  const images = selection.filter((el) => el.kind === 'image');
  if (images.length === 0) return [];
  const metas = await Promise.all(images.map((image) => canvas.getMeta(image.id)));
  return images.filter((_, i) => !metas[i]);
}

// How many plain images the current selection offers to convert — drives the
// Screen tile's contextual hint.
export async function adoptableImageCount(): Promise<number> {
  return (await adoptableImages(await services().canvas.selection())).length;
}

// The Screen tile's click action. The live selection is re-read here rather
// than trusting the panel's inspected count, so a click landing before the
// hint refreshes still does the right thing.
export async function placeOrAdoptScreens(): Promise<void> {
  const { canvas, notifier } = services();
  const images = await adoptableImages(await canvas.selection());
  if (images.length === 0) {
    await createBlockAtCenter('screen');
    return;
  }
  for (const image of images) {
    await canvas.setMeta(image.id, { type: 'screen' });
    const center = await absoluteCenter(image);
    await addTitleAbove(image.title?.trim() || 'Screen', image, center.x, center.y);
  }
  await notifier.info(
    `Converted ${images.length} ${images.length === 1 ? 'image' : 'images'} to ${
      images.length === 1 ? 'a screen' : 'screens'
    }.`,
  );
}
