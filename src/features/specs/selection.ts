// Everything driven by selection changes — the on-canvas buttons (a click IS a
// selection) and the fast container-size watcher. Wired once by the headless
// board script through the Runtime port.

import { SLICES_KEY, type FrameRecord } from '../../domain/records';
import type { CanvasElement } from '../../ports/canvas';
import type { SelectionItem } from '../../ports/runtime';
import { services } from '../../services';
import { readRecords } from '../helpers';
import { readSliceRecords, redockSliceButton, sliceSizeDiffers } from '../slices';
import { placeLinkedCopies } from './copies';
import { createSpecification } from './create';
import { SPECS_KEY, readSpecRecords, zoneTitle, type SpecZoneId } from './model';
import { reflowSpecFrame } from './reflow';

// Fast size watcher: resizing requires selecting the container, so while a spec
// or slice container is selected its size is polled on a short timer; once it
// settles, specs reflow and slice buttons re-dock — instead of waiting for the
// slow housekeeping tick.
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

function sizeDiffers(kind: WatchedKind, frame: CanvasElement, record: FrameRecord): boolean {
  if (kind === 'slice') return sliceSizeDiffers(frame, record);
  // Spec heights are tool-managed (reflow); only the width is user state.
  return frame.width !== record.width;
}

async function watchTick() {
  if (!watchedFrameId) return;
  const { canvas, store } = services();
  try {
    const key = watchedKind === 'spec' ? SPECS_KEY : SLICES_KEY;
    const records = await readRecords(key);
    const record = records.find((entry) => entry.frame === watchedFrameId);
    if (!record) {
      stopWatch();
      return;
    }
    const [frame] = await canvas.get([watchedFrameId]);
    if (!frame || frame.kind !== 'container') {
      stopWatch();
      return;
    }
    if (typeof record.width !== 'number') {
      record.width = frame.width;
      record.height = frame.height;
      await store.write(key, records);
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
    console.warn('Container size watch failed', error);
  }
}

async function finalSizeCheck(frameId: string, kind: WatchedKind) {
  const { canvas } = services();
  try {
    const key = kind === 'spec' ? SPECS_KEY : SLICES_KEY;
    const records = await readRecords(key);
    const record = records.find((entry) => entry.frame === frameId);
    if (!record || typeof record.width !== 'number') return;
    const [frame] = await canvas.get([frameId]);
    if (!frame || frame.kind !== 'container') return;
    if (!sizeDiffers(kind, frame, record)) return;
    if (kind === 'spec') await reflowSpecFrame(frame, record, records);
    else await redockSliceButton(frame, record, records);
  } catch (error) {
    console.warn('Container size check failed', error);
  }
}

async function updateSizeWatch(items: SelectionItem[]) {
  const frameItem = items.find((item) => item.kind === 'container');
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

// The arm-then-pick flow behind the on-canvas "+" buttons: selecting a "+" arms
// its spec and zone, and the next selection of cards gets copied there.
// Clicking empty canvas or anything uncopyable disarms.
let pendingCopyTarget: { specId: string; zone: SpecZoneId } | null = null;
let ignoreNextEmptySelection = false;

export async function handleSpecSelection(items: SelectionItem[]): Promise<void> {
  const { canvas, notifier } = services();
  await updateSizeWatch(items);
  if (items.length === 0) {
    if (ignoreNextEmptySelection) {
      ignoreNextEmptySelection = false;
    } else {
      pendingCopyTarget = null;
    }
    return;
  }

  if (items.length === 1 && items[0].kind === 'image') {
    const meta = await canvas.getMeta(items[0].id);
    if (meta && meta.type === 'spec-add') {
      pendingCopyTarget = { specId: meta.spec, zone: meta.zone };
      ignoreNextEmptySelection = true;
      try {
        await canvas.deselect();
      } catch {
        ignoreNextEmptySelection = false;
      }
      await notifier.info(`Now select the items to copy into ${zoneTitle(meta.zone)}.`);
      return;
    }
    if (meta && meta.type === 'slice-add-spec') {
      ignoreNextEmptySelection = true;
      try {
        await canvas.deselect();
      } catch {
        ignoreNextEmptySelection = false;
      }
      const [slice] = await canvas.get([meta.slice]);
      await createSpecification(slice && slice.kind === 'container' ? slice : null);
      await notifier.info('Specification added inside the slice.');
      return;
    }
  }

  if (!pendingCopyTarget) return;
  const cardIds = items.filter((item) => item.kind === 'card').map((item) => item.id);
  if (cardIds.length === 0) {
    // Not copyable — warn and stay armed so the user can pick again.
    await notifier.error('Only stickies — commands, events, read models, errors — can be copied.');
    return;
  }
  const target = pendingCopyTarget;
  pendingCopyTarget = null;
  const frames = await canvas.containers();
  const spec = frames.find((frame) => frame.id === target.specId);
  if (!spec) return;
  const fetched = await canvas.get(cardIds);
  const sources = fetched.filter((item) => item.kind === 'card');
  if (sources.length === 0) return;
  const copied = await placeLinkedCopies(spec, target.zone, sources);
  await notifier.info(`Copied ${copied} into ${zoneTitle(target.zone)}.`);
}
