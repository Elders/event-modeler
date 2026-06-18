// Slices: a titled container holding one atomic feature from vertical-slice
// architecture. The container captures elements placed inside it, so the
// slice's contents move with it. Containers can't carry metadata, so slices
// are tracked in a Store registry; links attach to the elements inside, not to
// the slice itself.

import {
  SLICE_BUTTON_INSET,
  SLICE_HEIGHT,
  SLICE_WIDTH,
  sliceBoundsAround,
  sliceButtonOffset,
} from '../domain/slice';
import { SLICES_KEY, type FrameRecord } from '../domain/records';
import { SPEC_ADD_SIZE } from '../domain/spec';
import { boundingBox } from '../domain/viewport';
import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { PLUS_ICON_URL } from './assets';
import { ensureVisible, readRecords, viewportCenter } from './helpers';

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
  const { canvas } = services();
  const frame = await canvas.createContainer({
    title: opts.title ?? 'Slice',
    x,
    y,
    width: opts.width ?? SLICE_WIDTH,
    height: opts.height ?? SLICE_HEIGHT,
    fill: 'transparent',
  });
  await adoptSliceFrame(frame);
  return frame;
}

// Attaches the on-canvas "add specification" button at a frame's bottom-center
// — selecting it places a new spec inside, growing the slice to fit — and
// registers the frame as a slice. Shared by createSlice (a fresh frame) and by
// adopting a plain frame the user drew. A failure here leaves the frame intact
// but unregistered, so it is logged rather than thrown.
export async function adoptSliceFrame(frame: CanvasElement): Promise<void> {
  const { canvas, store } = services();
  try {
    const offset = sliceButtonOffset(frame.width, frame.height);
    const button = await canvas.createImage({
      url: PLUS_ICON_URL,
      x: frame.x,
      y: frame.y + frame.height / 2 - SLICE_BUTTON_INSET,
      width: SPEC_ADD_SIZE,
    });
    await canvas.setMeta(button.id, { type: 'slice-add-spec', slice: frame.id });
    await canvas.addToContainer(frame.id, button.id, offset.x, offset.y);
    const records = await readSliceRecords();
    await store.write(SLICES_KEY, [
      ...records,
      { frame: frame.id, labels: [button.id], width: frame.width, height: frame.height },
    ]);
  } catch (error) {
    console.warn('Could not attach the add-spec button to the slice', error);
  }
}

// Draws a slice around the current selection, padded on all sides, and adopts
// the selected elements so the slice's contents move with it. With nothing
// usable selected it falls back to a default slice at the view center — so the
// palette tile always does something sensible. Connectors and frames are
// excluded: connectors have no footprint, and frames can't nest in a slice.
export async function createSliceAroundSelection(): Promise<CanvasElement> {
  const { canvas } = services();
  const selection = await canvas.selection();
  const framable = selection.filter(
    (el) =>
      el.kind !== 'connector' && el.kind !== 'container' && el.width > 0 && el.height > 0,
  );

  const box = boundingBox(framable);
  if (!box) {
    const { x, y } = await viewportCenter();
    return createSlice(x, y);
  }

  const bounds = sliceBoundsAround(box);
  const slice = await createSlice(bounds.x, bounds.y, {
    width: bounds.width,
    height: bounds.height,
  });

  // Re-parent each selected element, preserving its absolute position (the
  // child coords are relative to the slice's top-left). addToContainer swallows
  // failures, so an element that can't be adopted simply stays where it is.
  const frameLeft = bounds.x - bounds.width / 2;
  const frameTop = bounds.y - bounds.height / 2;
  for (const el of framable) {
    await canvas.addToContainer(slice.id, el.id, el.x - frameLeft, el.y - frameTop);
  }

  await ensureVisible([slice]);
  return slice;
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
