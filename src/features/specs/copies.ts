// Linked copies: cards copied into a spec zone as real typed blocks — the
// source's type is carried onto the copy, so the copy is recognized by the Fields
// editor and its fields can be edited. Each copy keeps a navigable reference back
// to its original and a one-way *color* sync; its text (and the fields in it) is
// the user's own and is never synced over.

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

// One card to place in a spec zone: its text and color, and — for a linked copy
// — the source element it mirrors (a source records a back-link and joins the
// content sync; a sourceless card, e.g. an error sticky, does neither).
export interface ZoneCard {
  content: string;
  color: string;
  source?: CanvasElement;
}

// Creates linked shallow copies of the given cards inside one spec zone.
export async function placeLinkedCopies(
  spec: CanvasElement,
  zoneId: SpecZoneId,
  sources: CanvasElement[],
): Promise<number> {
  return placeZoneCards(
    spec,
    zoneId,
    sources.map((source) => ({
      content: source.content ?? '',
      color: source.color ?? 'orange',
      source,
    })),
  );
}

// Places cards into one spec zone, growing the zone (and the frame, downward) to
// fit. Cards with a `source` become linked copies (back-link + content sync);
// sourceless cards are placed as-is. Shared by linked-copy placement and by
// dropping error stickies into a spec's Then zone.
export async function placeZoneCards(
  spec: CanvasElement,
  zoneId: SpecZoneId,
  cards: ZoneCard[],
): Promise<number> {
  if (cards.length === 0) return 0;
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

  // Grow the zone (and the frame, downward) when the new cards won't fit;
  // everything below the zone shifts down by the same amount. The top edge
  // stays in place.
  let workingSpec = spec;
  const required = requiredZoneHeight(occupied + cards.length, columns);
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
  let linked = false;
  const specTop = workingSpec.y - workingSpec.height / 2;
  const specLeft = workingSpec.x - workingSpec.width / 2;
  for (const card of cards) {
    const offset = copyOffset(zone.top, occupied, columns);
    const link = card.source ? await canvas.deepLink(card.source.id) : null;
    const created = await canvas.createCard({
      x: specLeft + offset.x,
      y: specTop + offset.y,
      width: SPEC_COPY_WIDTH,
      content: card.content,
      color: card.color,
      ...(link ? { link } : {}),
    });
    await canvas.addToContainer(spec.id, created.id, offset.x, offset.y);
    if (card.source) {
      // Carry the source's type onto the copy so it's a real typed block whose
      // fields are editable — not an anonymous sticky.
      const meta = await canvas.getMeta(card.source.id);
      if (meta) await canvas.setMeta(created.id, meta);
      links.push({ source: card.source.id, copy: created.id, spec: spec.id });
      linked = true;
    }
    occupied += 1;
  }
  if (linked) await store.write(LINKS_KEY, links);
  return cards.length;
}

// Housekeeping for spec copies: prune links whose copy was deleted, and follow
// the source's color (only) onto its copies. The copy's text is left alone so
// its fields stay editable. There are no item-update/delete events, so this polls.
//
// No supervisor here: this runs only inside specHousekeeping, which already has
// one. A second catch would just hide the failure from the pass that reports it.
export async function syncSpecCopies(): Promise<void> {
  const { canvas, store } = services();
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
    // Only the color follows the source — the copy's text (and its fields) is
    // the user's to edit, so it is never overwritten.
    if (source.color && source.color !== copy.color) {
      patches.push({ id: copy.id, color: source.color });
    }
  }
  if (patches.length > 0) await canvas.apply(patches);
  if (pruned) await store.write(LINKS_KEY, alive);
}
