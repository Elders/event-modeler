// Everything driven by selection:update — the on-board buttons (a click IS a
// selection) and the fast frame-size watcher. Registered once by the headless
// board script.

import { readRecordsFor, writeAppData, type FrameRecord } from '../../miro/appData';
import { META_KEY, isFrameItem, type FrameItem, type StickyItem } from '../../miro/helpers';
import {
  SLICES_KEY,
  readSliceRecords,
  redockSliceButton,
  sliceSizeDiffers,
} from '../slices';
import { placeLinkedCopies } from './copies';
import { createSpecification } from './create';
import { SPECS_KEY, readSpecRecords, zoneTitle, type SpecZoneId } from './model';
import { reflowSpecFrame } from './reflow';

// Fast size watcher: resizing requires selecting the frame, so while a spec
// or slice frame is selected its size is polled on a short timer; once it
// settles, specs reflow and slice buttons re-dock — instead of waiting for
// the slow housekeeping tick.
type WatchedKind = 'spec' | 'slice';
let watcherId: number | null = null;
let watchedFrameId: string | null = null;
let watchedKind: WatchedKind = 'spec';
let watchedLastWidth: number | null = null;
let watchedLastHeight: number | null = null;

function stopWatch() {
  if (watcherId !== null) {
    clearInterval(watcherId);
    watcherId = null;
  }
  watchedFrameId = null;
  watchedLastWidth = null;
  watchedLastHeight = null;
}

function sizeDiffers(kind: WatchedKind, frame: FrameItem, record: FrameRecord): boolean {
  if (kind === 'slice') return sliceSizeDiffers(frame, record);
  // Spec heights are app-managed (reflow); only the width is user state.
  return frame.width !== record.width;
}

async function watchTick() {
  if (!watchedFrameId) return;
  try {
    const key = watchedKind === 'spec' ? SPECS_KEY : SLICES_KEY;
    const records = await readRecordsFor(key);
    const record = records.find((entry) => entry.frame === watchedFrameId);
    if (!record) {
      stopWatch();
      return;
    }
    const [frame] = await miro.board.get({ id: [watchedFrameId] });
    if (!isFrameItem(frame)) {
      stopWatch();
      return;
    }
    if (typeof record.width !== 'number') {
      record.width = frame.width;
      record.height = frame.height;
      await writeAppData(key, records);
      return;
    }
    if (!sizeDiffers(watchedKind, frame, record)) {
      watchedLastWidth = frame.width;
      watchedLastHeight = frame.height;
      return;
    }
    const settled = watchedLastWidth === frame.width && watchedLastHeight === frame.height;
    if (!settled) {
      watchedLastWidth = frame.width; // still mid-drag — wait for it to settle
      watchedLastHeight = frame.height;
      return;
    }
    if (watchedKind === 'spec') await reflowSpecFrame(frame, record, records);
    else await redockSliceButton(frame, record, records);
  } catch (error) {
    console.warn('Frame size watch failed', error);
  }
}

async function finalSizeCheck(frameId: string, kind: WatchedKind) {
  try {
    const key = kind === 'spec' ? SPECS_KEY : SLICES_KEY;
    const records = await readRecordsFor(key);
    const record = records.find((entry) => entry.frame === frameId);
    if (!record || typeof record.width !== 'number') return;
    const [frame] = await miro.board.get({ id: [frameId] });
    if (!isFrameItem(frame)) return;
    if (!sizeDiffers(kind, frame, record)) return;
    if (kind === 'spec') await reflowSpecFrame(frame, record, records);
    else await redockSliceButton(frame, record, records);
  } catch (error) {
    console.warn('Frame size check failed', error);
  }
}

async function updateSizeWatch(items: { id: string; type: string }[]) {
  const frameItem = items.find((item) => item.type === 'frame');
  if (frameItem) {
    if (watchedFrameId === frameItem.id) return;
    let kind: WatchedKind | null = null;
    const specRecords = await readSpecRecords();
    if (specRecords.some((record) => record.frame === frameItem.id)) {
      kind = 'spec';
    } else {
      const sliceRecords = await readSliceRecords();
      if (sliceRecords.some((record) => record.frame === frameItem.id)) kind = 'slice';
    }
    if (!kind) return;
    stopWatch();
    watchedFrameId = frameItem.id;
    watchedKind = kind;
    watcherId = window.setInterval(() => void watchTick(), 350);
    return;
  }
  if (watchedFrameId) {
    const frameId = watchedFrameId;
    const kind = watchedKind;
    stopWatch();
    await finalSizeCheck(frameId, kind);
  }
}

// The arm-then-pick flow behind the on-board + buttons: selecting a + arms
// its spec and zone, and the next selection of stickies gets copied there.
// Clicking empty canvas or anything uncopyable disarms.
let pendingCopyTarget: { specId: string; zone: SpecZoneId } | null = null;
let ignoreNextEmptySelection = false;

export async function handleSpecSelection(event: { items: { id: string; type: string }[] }) {
  const items = event.items;
  await updateSizeWatch(items);
  if (items.length === 0) {
    if (ignoreNextEmptySelection) {
      ignoreNextEmptySelection = false;
    } else {
      pendingCopyTarget = null;
    }
    return;
  }

  if (items.length === 1 && items[0].type === 'image') {
    const [image] = await miro.board.get({ id: [items[0].id] });
    if (image && image.type === 'image') {
      let meta: unknown = null;
      try {
        meta = await image.getMetadata(META_KEY);
      } catch {
        meta = null;
      }
      const parsed = meta as {
        type?: string;
        zone?: SpecZoneId;
        spec?: string;
        slice?: string;
      } | null;
      if (parsed && parsed.type === 'spec-add' && parsed.zone && parsed.spec) {
        pendingCopyTarget = { specId: parsed.spec, zone: parsed.zone };
        ignoreNextEmptySelection = true;
        try {
          await miro.board.deselect();
        } catch {
          ignoreNextEmptySelection = false;
        }
        await miro.board.notifications.showInfo(
          `Now select the items to copy into ${zoneTitle(parsed.zone)}.`,
        );
        return;
      }
      if (parsed && parsed.type === 'slice-add-spec' && parsed.slice) {
        ignoreNextEmptySelection = true;
        try {
          await miro.board.deselect();
        } catch {
          ignoreNextEmptySelection = false;
        }
        const lookup = await miro.board.get({ id: [parsed.slice] });
        const slice = lookup.find(isFrameItem) ?? null;
        await createSpecification(slice);
        await miro.board.notifications.showInfo('Specification added below the slice.');
        return;
      }
    }
  }

  if (!pendingCopyTarget) return;
  const stickyIds = items.filter((item) => item.type === 'sticky_note').map((item) => item.id);
  if (stickyIds.length === 0) {
    // Not copyable — warn and stay armed so the user can pick again.
    await miro.board.notifications.showError(
      'Only stickies — commands, events, read models, errors — can be copied.',
    );
    return;
  }
  const target = pendingCopyTarget;
  pendingCopyTarget = null;
  const frames = await miro.board.get({ type: 'frame' });
  const spec = frames.find(
    (frame): frame is FrameItem => frame.type === 'frame' && frame.id === target.specId,
  );
  if (!spec) return;
  const fetched = await miro.board.get({ id: stickyIds });
  const sources = fetched.filter(
    (item): item is StickyItem => item.type === 'sticky_note' && 'content' in item,
  );
  if (sources.length === 0) return;
  const copied = await placeLinkedCopies(spec, target.zone, sources);
  await miro.board.notifications.showInfo(`Copied ${copied} into ${zoneTitle(target.zone)}.`);
}
