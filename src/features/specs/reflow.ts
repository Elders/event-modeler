// Re-grids a resized spec: recomputes columns from the current width, packs
// each zone's copies, recomputes zone heights, realigns the labels and "+"
// buttons, and resizes the container. Triggered by the fast size watcher (and
// the housekeeping tick as a fallback); the flag stops the two overlapping.

import type { FrameRecord } from '../../domain/records';
import type { CanvasElement, ElementPatch } from '../../ports/canvas';
import { services } from '../../services';
import {
  DEFAULT_ZONE_HEIGHTS,
  SPECS_KEY,
  SPEC_GAP,
  SPEC_MARGIN,
  SPEC_ZONES,
  copyOffset,
  requiredZoneHeight,
  specColumns,
  specFrameHeight,
  zoneExtent,
  zoneHeightsOf,
  zoneLabelOffset,
  zonePlusOffset,
  type SpecZoneId,
  type ZoneHeights,
} from './model';

let reflowInProgress = false;

export async function reflowSpecFrame(
  spec: CanvasElement,
  record: FrameRecord,
  records: FrameRecord[],
): Promise<void> {
  if (reflowInProgress) return;
  reflowInProgress = true;
  try {
    await doReflowSpecFrame(spec, record, records);
  } finally {
    reflowInProgress = false;
  }
}

async function doReflowSpecFrame(
  spec: CanvasElement,
  record: FrameRecord,
  records: FrameRecord[],
): Promise<void> {
  const { canvas, store } = services();
  const heights = zoneHeightsOf(record.zones);
  const children = await canvas.childrenOf(spec.id);
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
  const copies: Record<SpecZoneId, CanvasElement[]> = { given: [], when: [], then: [] };
  for (const child of children) {
    if (child.kind !== 'card') continue;
    copies[zoneOf(child.y)].push(child);
  }
  for (const list of Object.values(copies)) list.sort((a, b) => a.y - b.y || a.x - b.x);

  const columns = specColumns(spec.width);
  const newHeights: ZoneHeights = { ...heights };
  for (const zone of SPEC_ZONES) {
    newHeights[zone.id] = Math.max(
      DEFAULT_ZONE_HEIGHTS[zone.id],
      requiredZoneHeight(copies[zone.id].length, columns),
    );
  }

  // Grow before moving children, shrink after — children must never lie outside
  // the container bounds.
  const newFrameHeight = specFrameHeight(newHeights);
  const delta = newFrameHeight - spec.height;
  if (delta > 0) {
    await canvas.apply([{ id: spec.id, y: spec.y + delta / 2, height: newFrameHeight }]);
  }

  const moves: ElementPatch[] = [];
  for (const child of children) {
    if (!chromeIds.has(child.id)) continue;
    let zoneId: SpecZoneId | null = null;
    if (child.kind === 'text' && child.content) {
      const text = child.content;
      zoneId = SPEC_ZONES.find((zone) => text.includes(zone.label))?.id ?? null;
    } else if (child.kind === 'image') {
      const meta = await canvas.getMeta(child.id);
      zoneId = meta && meta.type === 'spec-add' ? meta.zone : null;
    }
    if (!zoneId) continue;
    const { top } = zoneExtent(newHeights, zoneId);
    const offset = child.kind === 'image' ? zonePlusOffset(top) : zoneLabelOffset(top);
    moves.push({ id: child.id, x: offset.x, y: offset.y });
  }
  for (const zone of SPEC_ZONES) {
    const { top } = zoneExtent(newHeights, zone.id);
    copies[zone.id].forEach((copy, index) => {
      const offset = copyOffset(top, index, columns);
      moves.push({ id: copy.id, x: offset.x, y: offset.y });
    });
  }
  await canvas.apply(moves);

  if (delta < 0) {
    await canvas.apply([{ id: spec.id, y: spec.y + delta / 2, height: newFrameHeight }]);
  }

  record.zones = newHeights;
  record.width = spec.width;
  await store.write(SPECS_KEY, records);
}
