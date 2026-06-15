// The periodic background pass, run from the headless board script: cleans up
// after deleted spec/slice containers, applies fallback reflows and slice
// button re-docks, and syncs linked copies. Polling is the only option — there
// are no item-update or item-delete events.

import { LINKS_KEY, SLICES_KEY, SPECS_KEY, type SpecLink } from '../../domain/records';
import { services } from '../../services';
import { readRecords } from '../helpers';
import { autoRedockSlices } from '../slices';
import { syncSpecCopies } from './copies';
import { readSpecRecords } from './model';
import { reflowSpecFrame } from './reflow';

// Removes leftovers of specs and slices whose container was deleted by the
// user: labels, "+" buttons and linked copies survive a container deletion if
// they were never (or no longer) attached as children, so the registries
// remember them.
async function cleanupDeadRegistry(key: string, pruneLinks: boolean) {
  const { canvas, store } = services();
  const records = await readRecords(key);
  if (records.length === 0) return;
  const frames = await canvas.containers();
  const liveIds = new Set(frames.map((frame) => frame.id));
  const dead = records.filter((record) => !liveIds.has(record.frame));
  if (dead.length === 0) return;

  const deadIds = new Set(dead.map((record) => record.frame));
  let links: SpecLink[] = [];
  let doomedIds = dead.flatMap((record) => record.labels);
  if (pruneLinks) {
    links = await store.read<SpecLink[]>(LINKS_KEY, []);
    doomedIds = [
      ...doomedIds,
      ...links.filter((link) => link.spec && deadIds.has(link.spec)).map((link) => link.copy),
    ];
  }
  doomedIds = [...new Set(doomedIds)];
  for (const id of doomedIds) await canvas.remove(id);

  await store.write(
    key,
    records.filter((record) => liveIds.has(record.frame)),
  );
  if (pruneLinks) {
    await store.write(
      LINKS_KEY,
      links.filter((link) => !(link.spec && deadIds.has(link.spec))),
    );
  }
}

async function cleanupDeadFrames() {
  await cleanupDeadRegistry(SPECS_KEY, true);
  await cleanupDeadRegistry(SLICES_KEY, false);
}

// Width changes are detected by polling (no resize events); a reflow fires only
// after the width has been stable for two ticks, so we don't re-grid mid-drag.
// The fast watcher in selection.ts handles the interactive case; this is the
// multiplayer/panel-closed fallback.
const pendingWidths = new Map<string, number>();

async function autoReflowSpecs() {
  const { canvas, store } = services();
  const records = await readSpecRecords();
  if (records.length === 0) return;
  const frames = await canvas.containers();
  let dirty = false;
  for (const record of records) {
    const frame = frames.find((item) => item.id === record.frame);
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
  if (dirty) await store.write(SPECS_KEY, records);
}

let housekeepingRunning = false;

export async function specHousekeeping(): Promise<void> {
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
