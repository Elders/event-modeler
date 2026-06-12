// Re-grids a resized spec: recomputes columns from the current width, packs
// each zone's copies, recomputes zone heights, realigns the labels and +
// buttons, and resizes the frame. Triggered by the fast size watcher (and
// the housekeeping tick as a fallback); the flag stops the two overlapping.

import { writeAppData, type FrameRecord } from '../../miro/appData';
import { META_KEY, type FrameItem } from '../../miro/helpers';
import { SPEC_ADD_SIZE } from '../../miro/icons';
import {
  DEFAULT_ZONE_HEIGHTS,
  SPECS_KEY,
  SPEC_COPY_GAP,
  SPEC_COPY_WIDTH,
  SPEC_GAP,
  SPEC_MARGIN,
  SPEC_ZONES,
  specColumns,
  specFrameHeight,
  zoneExtent,
  zoneHeightsOf,
  type SpecZoneId,
  type ZoneHeights,
} from './model';

let reflowInProgress = false;

export async function reflowSpecFrame(
  spec: FrameItem,
  record: FrameRecord,
  records: FrameRecord[],
) {
  if (reflowInProgress) return;
  reflowInProgress = true;
  try {
    await doReflowSpecFrame(spec, record, records);
  } finally {
    reflowInProgress = false;
  }
}

async function doReflowSpecFrame(spec: FrameItem, record: FrameRecord, records: FrameRecord[]) {
  const heights = zoneHeightsOf(record);
  const children = await spec.getChildren();
  const chromeIds = new Set(record.labels);

  // Assign each copy to a zone by its current position (split mid-gap).
  const zoneOf = (yPos: number): SpecZoneId => {
    let boundary = SPEC_MARGIN;
    for (const zone of SPEC_ZONES) {
      boundary += heights[zone.id] + SPEC_GAP;
      if (yPos < boundary - SPEC_GAP / 2) return zone.id;
    }
    return 'then';
  };
  type Movable = { id: string; x: number; y: number; sync(): Promise<unknown> };
  const copies: Record<SpecZoneId, Movable[]> = { given: [], when: [], then: [] };
  for (const child of children) {
    if (child.type !== 'sticky_note') continue;
    const movable = child as unknown as Movable;
    copies[zoneOf(movable.y)].push(movable);
  }
  for (const list of Object.values(copies)) list.sort((a, b) => a.y - b.y || a.x - b.x);

  const columns = specColumns(spec.width);
  const newHeights: ZoneHeights = { ...heights };
  for (const zone of SPEC_ZONES) {
    const rows = Math.ceil(copies[zone.id].length / columns);
    newHeights[zone.id] = Math.max(
      DEFAULT_ZONE_HEIGHTS[zone.id],
      40 + rows * (SPEC_COPY_WIDTH + 16) + 12,
    );
  }

  // Grow before moving children, shrink after — children must never lie
  // outside the frame bounds.
  const newFrameHeight = specFrameHeight(newHeights);
  const delta = newFrameHeight - spec.height;
  if (delta > 0) {
    spec.height = newFrameHeight;
    spec.y += delta / 2;
    await spec.sync();
  }

  const moves: Promise<unknown>[] = [];
  for (const child of children) {
    if (!chromeIds.has(child.id)) continue;
    let zoneId: SpecZoneId | null = null;
    if (child.type === 'text' && 'content' in child) {
      const text = String((child as { content?: unknown }).content ?? '');
      zoneId = SPEC_ZONES.find((zone) => text.includes(zone.label))?.id ?? null;
    } else if (child.type === 'image') {
      try {
        const meta = (await child.getMetadata(META_KEY)) as { zone?: SpecZoneId } | null;
        zoneId = meta?.zone ?? null;
      } catch {
        zoneId = null;
      }
    }
    if (!zoneId) continue;
    const movable = child as unknown as Movable;
    movable.x = child.type === 'image' ? 24 + SPEC_ADD_SIZE / 2 : 128;
    movable.y = zoneExtent(newHeights, zoneId).top + 16;
    moves.push(movable.sync());
  }
  for (const zone of SPEC_ZONES) {
    const { top } = zoneExtent(newHeights, zone.id);
    copies[zone.id].forEach((copy, index) => {
      copy.x = 130 + (index % columns) * (SPEC_COPY_WIDTH + SPEC_COPY_GAP);
      copy.y =
        top + 40 + SPEC_COPY_WIDTH / 2 + Math.floor(index / columns) * (SPEC_COPY_WIDTH + 16);
      moves.push(copy.sync());
    });
  }
  await Promise.all(moves);

  if (delta < 0) {
    spec.height = newFrameHeight;
    spec.y += delta / 2;
    await spec.sync();
  }

  record.zones = newHeights;
  record.width = spec.width;
  await writeAppData(SPECS_KEY, records);
}
