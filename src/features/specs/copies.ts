// Linked shallow copies: cards copied into a spec zone, carrying a navigable
// reference back to their originals, with a one-way content/color sync from
// source to copy.

import type { CanvasElement, ElementPatch } from '../../ports/canvas';
import { services } from '../../services';
import {
  LINKS_KEY,
  SPECS_KEY,
  SPEC_COPY_WIDTH,
  copyOffset,
  readSpecRecords,
  requiredZoneHeight,
  specColumns,
  zoneExtent,
  zoneHeightsOf,
  type SpecLink,
  type SpecZoneId,
} from './model';

// Creates linked shallow copies of the given cards inside one spec zone.
export async function placeLinkedCopies(
  spec: CanvasElement,
  zoneId: SpecZoneId,
  sources: CanvasElement[],
): Promise<number> {
  const { canvas, store } = services();
  const records = await readSpecRecords();
  const record = records.find((entry) => entry.frame === spec.id);
  const heights = zoneHeightsOf(record?.zones);
  const zone = zoneExtent(heights, zoneId);

  const children = await canvas.childrenOf(spec.id);
  let occupied = children.filter(
    (child) => child.kind === 'card' && child.y >= zone.top && child.y < zone.top + zone.height,
  ).length;

  const columns = specColumns(spec.width);

  // Grow the zone (and the frame, downward) when the new copies won't fit;
  // everything below the zone shifts down by the same amount. The top edge
  // stays in place.
  let workingSpec = spec;
  const required = requiredZoneHeight(occupied + sources.length, columns);
  if (required > zone.height) {
    const delta = required - zone.height;
    await canvas.apply([{ id: spec.id, y: spec.y + delta / 2, height: spec.height + delta }]);
    const boundary = zone.top + zone.height;
    const shifts: ElementPatch[] = children
      .filter((child) => child.y >= boundary)
      .map((child) => ({ id: child.id, y: child.y + delta }));
    if (shifts.length > 0) await canvas.apply(shifts);
    heights[zoneId] = required;
    if (record) {
      record.zones = heights;
      await store.write(SPECS_KEY, records);
    }
    workingSpec = { ...spec, y: spec.y + delta / 2, height: spec.height + delta };
  }

  const links = await store.read<SpecLink[]>(LINKS_KEY, []);
  const specTop = workingSpec.y - workingSpec.height / 2;
  const specLeft = workingSpec.x - workingSpec.width / 2;
  for (const source of sources) {
    const offset = copyOffset(zone.top, occupied, columns);
    const link = await canvas.deepLink(source.id);
    const copy = await canvas.createCard({
      x: specLeft + offset.x,
      y: specTop + offset.y,
      width: SPEC_COPY_WIDTH,
      content: source.content ?? '',
      color: source.color ?? 'orange',
      ...(link ? { link } : {}),
    });
    await canvas.addToContainer(spec.id, copy.id, offset.x, offset.y);
    links.push({ source: source.id, copy: copy.id, spec: spec.id });
    occupied += 1;
  }
  await store.write(LINKS_KEY, links);
  return sources.length;
}

// One-way sync: edits to a source card propagate to its spec copies. There are
// no item-update or item-delete events, so housekeeping polls this.
export async function syncSpecCopies(): Promise<void> {
  const { canvas, store } = services();
  try {
    const links = await store.read<SpecLink[]>(LINKS_KEY, []);
    if (links.length === 0) return;
    const ids = [...new Set(links.flatMap((link) => [link.source, link.copy]))];
    const items = await canvas.get(ids);
    const byId = new Map(items.map((item) => [item.id, item]));

    const alive: SpecLink[] = [];
    const patches: ElementPatch[] = [];
    let pruned = false;
    for (const link of links) {
      const source = byId.get(link.source);
      const copy = byId.get(link.copy);
      if (!copy || copy.kind !== 'card') {
        pruned = true; // the copy was deleted; forget the link
        continue;
      }
      alive.push(link);
      if (!source || source.kind !== 'card') continue;
      if (source.content !== copy.content || source.color !== copy.color) {
        patches.push({
          id: copy.id,
          content: source.content ?? '',
          ...(source.color ? { color: source.color } : {}),
        });
      }
    }
    if (patches.length > 0) await canvas.apply(patches);
    if (pruned) await store.write(LINKS_KEY, alive);
  } catch (error) {
    console.warn('Spec copy sync failed', error);
  }
}
