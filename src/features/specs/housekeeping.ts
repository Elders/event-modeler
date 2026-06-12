// The periodic background pass, run from the headless board script: cleans
// up after deleted spec/slice frames, applies fallback reflows and slice
// button re-docks, and syncs linked copies. Polling is the only option — the
// SDK has no item-update or item-delete events.

import { readAppData, readRecordsFor, writeAppData } from '../../miro/appData';
import { type FrameItem } from '../../miro/helpers';
import { SLICES_KEY, autoRedockSlices } from '../slices';
import { syncSpecCopies } from './copies';
import { LINKS_KEY, SPECS_KEY, readSpecRecords, type SpecLink } from './model';
import { reflowSpecFrame } from './reflow';

// Removes leftovers of specs and slices whose frame was deleted by the user:
// labels, + buttons and linked copies survive a frame deletion if they were
// never (or no longer) attached as children, so the registries remember them.
async function cleanupDeadRegistry(key: string, pruneLinks: boolean) {
  const records = await readRecordsFor(key);
  if (records.length === 0) return;
  const frames = await miro.board.get({ type: 'frame' });
  const liveIds = new Set(frames.map((frame) => frame.id));
  const dead = records.filter((record) => !liveIds.has(record.frame));
  if (dead.length === 0) return;

  const deadIds = new Set(dead.map((record) => record.frame));
  let links: SpecLink[] = [];
  let doomedIds = dead.flatMap((record) => record.labels);
  if (pruneLinks) {
    links = await readAppData<SpecLink[]>(LINKS_KEY, []);
    doomedIds = [
      ...doomedIds,
      ...links.filter((link) => link.spec && deadIds.has(link.spec)).map((link) => link.copy),
    ];
  }
  doomedIds = [...new Set(doomedIds)];
  if (doomedIds.length > 0) {
    try {
      const doomed = await miro.board.get({ id: doomedIds });
      for (const item of doomed) {
        try {
          await miro.board.remove(item);
        } catch (error) {
          console.warn('Could not remove a leftover item', error);
        }
      }
    } catch (error) {
      console.warn('Could not look up leftover items', error);
    }
  }

  await writeAppData(
    key,
    records.filter((record) => liveIds.has(record.frame)),
  );
  if (pruneLinks) {
    await writeAppData(
      LINKS_KEY,
      links.filter((link) => !(link.spec && deadIds.has(link.spec))),
    );
  }
}

async function cleanupDeadFrames() {
  await cleanupDeadRegistry(SPECS_KEY, true);
  await cleanupDeadRegistry(SLICES_KEY, false);
}

// Width changes are detected by polling (no resize events in the SDK); a
// reflow fires only after the width has been stable for two ticks, so we
// don't re-grid mid-drag. The fast watcher in selection.ts handles the
// interactive case; this is the multiplayer/panel-closed fallback.
const pendingWidths = new Map<string, number>();

async function autoReflowSpecs() {
  const records = await readSpecRecords();
  if (records.length === 0) return;
  const frames = await miro.board.get({ type: 'frame' });
  let dirty = false;
  for (const record of records) {
    const frame = frames.find(
      (item): item is FrameItem => item.type === 'frame' && item.id === record.frame,
    );
    if (!frame) continue; // a deleted spec — cleanup handles it
    if (typeof record.width !== 'number') {
      record.width = frame.width; // older record: adopt the current width
      dirty = true;
      continue;
    }
    if (frame.width === record.width) {
      pendingWidths.delete(frame.id);
      continue;
    }
    const seen = pendingWidths.get(frame.id);
    if (seen !== frame.width) {
      pendingWidths.set(frame.id, frame.width); // still being resized — wait
      continue;
    }
    pendingWidths.delete(frame.id);
    await reflowSpecFrame(frame, record, records);
  }
  if (dirty) await writeAppData(SPECS_KEY, records);
}

let housekeepingRunning = false;

export async function specHousekeeping() {
  if (housekeepingRunning) return;
  housekeepingRunning = true;
  try {
    await cleanupDeadFrames();
    await autoReflowSpecs();
    await autoRedockSlices();
    await syncSpecCopies();
  } finally {
    housekeepingRunning = false;
  }
}
