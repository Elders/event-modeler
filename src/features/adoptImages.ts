// Adopting plain images — ones the user placed with the host's own tools,
// carrying no model metadata — as screens: the image gains the screen type tag
// and the grouped editable title above it, making it indistinguishable from a
// palette-placed screen (the Fields editor, pattern anchoring, and connectors
// all read the tag). Drives the Screen tile's contextual click: with plain
// images selected the tile converts them; otherwise it places a fresh sketch.

import { services } from '../services';
import type { SelectionItem } from '../ports/runtime';
import { createBlockAtCenter } from './createBlock';
import { absoluteCenter, addTitleAbove } from './helpers';

// Plain images in the selection: image elements carrying no tool metadata
// (screens, automation gears, and the on-canvas buttons are all tagged).
// Generic over the selection element — identity and kind are all it needs — so
// the panel can pass the free `SelectionItem`s from selection:update while the
// adoption below passes the full `CanvasElement`s it goes on to place titles by.
async function adoptableImages<T extends SelectionItem>(selection: T[]): Promise<T[]> {
  const { canvas } = services();
  const images = selection.filter((el) => el.kind === 'image');
  if (images.length === 0) return [];
  const metas = await Promise.all(images.map((image) => canvas.getMeta(image.id)));
  return images.filter((_, i) => !metas[i]);
}

// How many plain images the current selection offers to convert — drives the
// Screen tile's contextual hint. Counts against the selection the caller was
// handed: re-reading it cost a 500-credit `board.getSelection()` (Weight Level 3)
// for a payload selection:update had already pushed for free.
export async function adoptableImageCount(selection: SelectionItem[]): Promise<number> {
  return (await adoptableImages(selection)).length;
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
