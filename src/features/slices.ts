// Slices: a titled Miro frame holding one atomic feature from vertical-slice
// architecture. The frame captures items placed inside it, so the slice's
// contents move with it. Frames don't support app metadata, so slices are
// tracked in the board app-data registry instead; arrows attach to the items
// inside, not to the slice itself.

import { readRecordsFor, writeAppData, type FrameRecord } from '../miro/appData';
import { META_KEY, type BoardItem, type FrameItem } from '../miro/helpers';
import { PLUS_ICON_URL, SPEC_ADD_SIZE } from '../miro/icons';

// A slice spans the full three-lane stack (3 × 500), cutting the model into
// vertical feature strips.
export const SLICE_WIDTH = 700;
export const SLICE_HEIGHT = 1500;
const SLICE_BUTTON_INSET = 30;

export const SLICES_KEY = 'em-slices';

export async function readSliceRecords(): Promise<FrameRecord[]> {
  return readRecordsFor(SLICES_KEY);
}

export async function createSlice(x: number, y: number) {
  // The live SDK's validation requires `style.fillColor` (the published
  // typings mark it optional) and rejects a `content` property outright —
  // even though its own "required" error message once listed one.
  const frame = await miro.board.createFrame({
    title: 'Slice',
    x,
    y,
    width: SLICE_WIDTH,
    height: SLICE_HEIGHT,
    style: { fillColor: 'transparent' },
  });
  // On-board "add specification" button at the slice's bottom center —
  // selecting it stacks a new spec beneath this slice.
  try {
    const addSpecButton = await miro.board.createImage({
      url: PLUS_ICON_URL,
      x,
      y: y + SLICE_HEIGHT / 2 - SLICE_BUTTON_INSET,
      width: SPEC_ADD_SIZE,
    });
    await addSpecButton.setMetadata(META_KEY, { type: 'slice-add-spec', slice: frame.id });
    await frame.add(addSpecButton);
    addSpecButton.x = SLICE_WIDTH / 2;
    addSpecButton.y = SLICE_HEIGHT - SLICE_BUTTON_INSET;
    await addSpecButton.sync();
    const sliceRecords = await readSliceRecords();
    await writeAppData(SLICES_KEY, [
      ...sliceRecords,
      {
        frame: frame.id,
        labels: [addSpecButton.id],
        width: SLICE_WIDTH,
        height: SLICE_HEIGHT,
      },
    ]);
  } catch (error) {
    console.warn('Could not attach the add-spec button to the slice', error);
  }
  return frame;
}

// Slice buttons care about both dimensions (bottom-center); specs only track
// width, since their height is app-managed by the reflow.
export function sliceSizeDiffers(frame: FrameItem, record: FrameRecord): boolean {
  return frame.width !== record.width || frame.height !== (record.height ?? frame.height);
}

// Re-docks a slice's add-spec button to the bottom-center after a resize, and
// records the slice's current size. Self-healing: shrinking a frame evicts or
// deletes children that fall outside the new bounds, so the button is
// re-adopted or recreated as needed.
export async function redockSliceButton(
  slice: FrameItem,
  record: FrameRecord,
  records: FrameRecord[],
) {
  try {
    const targetRelX = slice.width / 2;
    const targetRelY = slice.height - SLICE_BUTTON_INSET;
    const buttonId = record.labels[0];
    let button: BoardItem | undefined;
    if (buttonId) {
      try {
        const lookup = await miro.board.get({ id: [buttonId] });
        button = lookup[0];
      } catch {
        button = undefined;
      }
    }
    if (button && button.type === 'image') {
      const movable = button as unknown as {
        x: number;
        y: number;
        parentId?: string | null;
        sync(): Promise<unknown>;
      };
      if (movable.parentId === slice.id) {
        movable.x = targetRelX;
        movable.y = targetRelY;
        await movable.sync();
      } else {
        // Shrinking the slice evicted the button from the frame — re-adopt it.
        try {
          await slice.add(button as unknown as Parameters<typeof slice.add>[0]);
          movable.x = targetRelX;
          movable.y = targetRelY;
          await movable.sync();
        } catch {
          // Could not re-parent: pin it visually at the bottom-center instead.
          movable.x = slice.x;
          movable.y = slice.y + slice.height / 2 - SLICE_BUTTON_INSET;
          await movable.sync();
        }
      }
    } else {
      // The button is gone (Miro can drop children on shrink) — recreate it.
      const fresh = await miro.board.createImage({
        url: PLUS_ICON_URL,
        x: slice.x,
        y: slice.y + slice.height / 2 - SLICE_BUTTON_INSET,
        width: SPEC_ADD_SIZE,
      });
      await fresh.setMetadata(META_KEY, { type: 'slice-add-spec', slice: slice.id });
      try {
        await slice.add(fresh);
        fresh.x = targetRelX;
        fresh.y = targetRelY;
        await fresh.sync();
      } catch (error) {
        console.warn('Could not attach the recreated slice button', error);
      }
      record.labels = [fresh.id];
    }
  } catch (error) {
    console.warn('Could not re-dock the slice button', error);
  }
  record.width = slice.width;
  record.height = slice.height;
  await writeAppData(SLICES_KEY, records);
}

// Fallback re-docking for slice buttons (panel closed during the resize, or
// a teammate resizing); the fast watcher handles the interactive case. Also
// heals buttons that were evicted or deleted when a slice was shrunk.
export async function autoRedockSlices() {
  const records = await readSliceRecords();
  if (records.length === 0) return;
  const frames = await miro.board.get({ type: 'frame' });
  for (const record of records) {
    const frame = frames.find(
      (item): item is FrameItem => item.type === 'frame' && item.id === record.frame,
    );
    if (!frame) continue; // a deleted slice — cleanup handles it
    let needsRedock = typeof record.width !== 'number' || sliceSizeDiffers(frame, record);
    if (!needsRedock) {
      const buttonId = record.labels[0];
      if (!buttonId) {
        needsRedock = true;
      } else {
        try {
          const [button] = await miro.board.get({ id: [buttonId] });
          const parentId =
            button && 'parentId' in button
              ? (button as { parentId?: string | null }).parentId
              : null;
          needsRedock = !button || button.type !== 'image' || parentId !== frame.id;
        } catch {
          needsRedock = true;
        }
      }
    }
    if (needsRedock) await redockSliceButton(frame, record, records);
  }
}
