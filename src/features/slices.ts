// Slices: a titled container holding one atomic feature from vertical-slice
// architecture. The container captures elements placed inside it, so the
// slice's contents move with it. Containers can't carry metadata, so slices
// are tracked in a Store registry; links attach to the elements inside, not to
// the slice itself.

import {
  SLICE_BUTTON_INSET,
  SLICE_HEIGHT,
  SLICE_WIDTH,
  sliceButtonOffset,
} from '../domain/slice';
import { SLICES_KEY, type FrameRecord } from '../domain/records';
import { SPEC_ADD_SIZE } from '../domain/spec';
import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { PLUS_ICON_URL } from './assets';
import { readRecords } from './helpers';

export async function readSliceRecords(): Promise<FrameRecord[]> {
  return readRecords(SLICES_KEY);
}

export interface SliceOptions {
  width?: number;
  height?: number;
  title?: string;
}

export async function createSlice(
  x: number,
  y: number,
  opts: SliceOptions = {},
): Promise<CanvasElement> {
  const { canvas, store } = services();
  const width = opts.width ?? SLICE_WIDTH;
  const height = opts.height ?? SLICE_HEIGHT;
  const frame = await canvas.createContainer({
    title: opts.title ?? 'Slice',
    x,
    y,
    width,
    height,
    fill: 'transparent',
  });
  // On-canvas "add specification" button at the slice's bottom-center —
  // selecting it stacks a new spec beneath this slice.
  try {
    const offset = sliceButtonOffset(width, height);
    const button = await canvas.createImage({
      url: PLUS_ICON_URL,
      x,
      y: y + height / 2 - SLICE_BUTTON_INSET,
      width: SPEC_ADD_SIZE,
    });
    await canvas.setMeta(button.id, { type: 'slice-add-spec', slice: frame.id });
    await canvas.addToContainer(frame.id, button.id, offset.x, offset.y);
    const records = await readSliceRecords();
    await store.write(SLICES_KEY, [
      ...records,
      { frame: frame.id, labels: [button.id], width, height },
    ]);
  } catch (error) {
    console.warn('Could not attach the add-spec button to the slice', error);
  }
  return frame;
}

// Slice buttons care about both dimensions (bottom-center); specs only track
// width, since their height is tool-managed by the reflow.
export function sliceSizeDiffers(frame: CanvasElement, record: FrameRecord): boolean {
  return frame.width !== record.width || frame.height !== (record.height ?? frame.height);
}

// Re-docks a slice's add-spec button to the bottom-center after a resize and
// records the slice's current size. Self-healing: shrinking a container evicts
// or deletes children that fall outside the new bounds, so the button is
// re-adopted or recreated as needed.
export async function redockSliceButton(
  slice: CanvasElement,
  record: FrameRecord,
  records: FrameRecord[],
): Promise<void> {
  const { canvas, store } = services();
  try {
    const offset = sliceButtonOffset(slice.width, slice.height);
    const buttonId = record.labels[0];
    const [button] = buttonId ? await canvas.get([buttonId]) : [];
    if (button && button.kind === 'image') {
      if (button.parentId === slice.id) {
        await canvas.apply([{ id: button.id, x: offset.x, y: offset.y }]);
      } else {
        // Shrinking the slice evicted the button — pin it at the bottom-center
        // absolutely, then re-adopt it so it tracks future moves.
        await canvas.apply([
          { id: button.id, x: slice.x, y: slice.y + slice.height / 2 - SLICE_BUTTON_INSET },
        ]);
        await canvas.addToContainer(slice.id, button.id, offset.x, offset.y);
      }
    } else {
      // The button is gone (children can be dropped on shrink) — recreate it.
      const fresh = await canvas.createImage({
        url: PLUS_ICON_URL,
        x: slice.x,
        y: slice.y + slice.height / 2 - SLICE_BUTTON_INSET,
        width: SPEC_ADD_SIZE,
      });
      await canvas.setMeta(fresh.id, { type: 'slice-add-spec', slice: slice.id });
      await canvas.addToContainer(slice.id, fresh.id, offset.x, offset.y);
      record.labels = [fresh.id];
    }
  } catch (error) {
    console.warn('Could not re-dock the slice button', error);
  }
  record.width = slice.width;
  record.height = slice.height;
  await store.write(SLICES_KEY, records);
}

// Fallback re-docking for slice buttons (panel closed during the resize, or a
// teammate resizing); the fast watcher handles the interactive case. Also
// heals buttons that were evicted or deleted when a slice was shrunk.
export async function autoRedockSlices(): Promise<void> {
  const { canvas } = services();
  const records = await readSliceRecords();
  if (records.length === 0) return;
  const frames = await canvas.containers();
  for (const record of records) {
    const frame = frames.find((item) => item.id === record.frame);
    if (!frame) continue; // a deleted slice — cleanup handles it
    let needsRedock = typeof record.width !== 'number' || sliceSizeDiffers(frame, record);
    if (!needsRedock) {
      const buttonId = record.labels[0];
      if (!buttonId) {
        needsRedock = true;
      } else {
        const [button] = await canvas.get([buttonId]);
        needsRedock = !button || button.kind !== 'image' || button.parentId !== frame.id;
      }
    }
    if (needsRedock) await redockSliceButton(frame, record, records);
  }
}
