// Linked shallow copies: stickies copied into a spec zone, native-linked back
// to their originals, with a one-way content/color sync from source to copy.

import { readAppData, writeAppData } from '../../miro/appData';
import { itemDeepLink, type FrameItem, type StickyItem } from '../../miro/helpers';
import {
  LINKS_KEY,
  SPECS_KEY,
  SPEC_COPY_GAP,
  SPEC_COPY_WIDTH,
  readSpecRecords,
  specColumns,
  zoneExtent,
  zoneHeightsOf,
  type SpecLink,
  type SpecZoneId,
} from './model';

// Creates linked shallow copies of the given stickies inside one spec zone.
export async function placeLinkedCopies(
  spec: FrameItem,
  zoneId: SpecZoneId,
  sources: StickyItem[],
): Promise<number> {
  const records = await readSpecRecords();
  const record = records.find((entry) => entry.frame === spec.id);
  const heights = zoneHeightsOf(record);
  const zone = zoneExtent(heights, zoneId);

  const children = await spec.getChildren();
  let occupied = children.filter(
    (child) =>
      child.type === 'sticky_note' &&
      'y' in child &&
      typeof child.y === 'number' &&
      child.y >= zone.top &&
      child.y < zone.top + zone.height,
  ).length;

  const columns = specColumns(spec.width);

  // Grow the zone (and the frame, downward) when the new copies won't fit;
  // everything below the zone shifts down by the same amount.
  const rows = Math.ceil((occupied + sources.length) / columns);
  const required = 40 + rows * (SPEC_COPY_WIDTH + 16) + 12;
  if (required > zone.height) {
    const delta = required - zone.height;
    spec.height += delta;
    spec.y += delta / 2; // keep the top edge in place
    await spec.sync();
    const boundary = zone.top + zone.height;
    for (const child of children) {
      const movable = child as unknown as { y: number; sync: () => Promise<unknown> };
      if (typeof movable.y === 'number' && movable.y >= boundary) {
        movable.y += delta;
        await movable.sync();
      }
    }
    heights[zoneId] = required;
    if (record) {
      record.zones = heights;
      await writeAppData(SPECS_KEY, records);
    }
  }

  const links = await readAppData<SpecLink[]>(LINKS_KEY, []);
  const specTop = spec.y - spec.height / 2;
  const specLeft = spec.x - spec.width / 2;
  for (const source of sources) {
    const column = occupied % columns;
    const row = Math.floor(occupied / columns);
    const relX = 130 + column * (SPEC_COPY_WIDTH + SPEC_COPY_GAP);
    const relY = zone.top + 40 + SPEC_COPY_WIDTH / 2 + row * (SPEC_COPY_WIDTH + 16);
    const deepLink = await itemDeepLink(source.id);
    const copy = await miro.board.createStickyNote({
      x: specLeft + relX,
      y: specTop + relY,
      shape: 'square',
      width: SPEC_COPY_WIDTH,
      content: source.content,
      style: { fillColor: source.style.fillColor },
      ...(deepLink ? { linkedTo: deepLink } : {}),
    });
    try {
      await spec.add(copy);
      copy.x = relX;
      copy.y = relY;
      await copy.sync();
    } catch (error) {
      console.warn('Could not attach a copy to the specification frame', error);
    }
    links.push({ source: source.id, copy: copy.id, spec: spec.id });
    occupied += 1;
  }
  await writeAppData(LINKS_KEY, links);
  return sources.length;
}

// One-way sync: edits to a source sticky propagate to its spec copies. The
// SDK has no item-update or item-delete events, so housekeeping polls this.
export async function syncSpecCopies() {
  try {
    const links = await readAppData<SpecLink[]>(LINKS_KEY, []);
    if (links.length === 0) return;
    const ids = [...new Set(links.flatMap((link) => [link.source, link.copy]))];
    const items = await miro.board.get({ id: ids });
    const byId = new Map(items.map((item) => [item.id, item]));
    type FetchedItem = (typeof items)[number];
    const isSticky = (
      item: FetchedItem | undefined,
    ): item is Extract<FetchedItem, { type: 'sticky_note' }> =>
      !!item && item.type === 'sticky_note' && 'content' in item;

    const alive: SpecLink[] = [];
    let pruned = false;
    for (const link of links) {
      const source = byId.get(link.source);
      const copy = byId.get(link.copy);
      if (!isSticky(copy)) {
        pruned = true; // the copy was deleted; forget the link
        continue;
      }
      alive.push(link);
      if (!isSticky(source)) continue;
      if (
        source.content !== copy.content ||
        source.style.fillColor !== copy.style.fillColor
      ) {
        copy.content = source.content;
        copy.style.fillColor = source.style.fillColor;
        await copy.sync();
      }
    }
    if (pruned) await writeAppData(LINKS_KEY, alive);
  } catch (error) {
    console.warn('Spec copy sync failed', error);
  }
}
