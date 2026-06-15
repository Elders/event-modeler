// Specification geometry: zone vocabulary and the pure layout math shared by
// the spec use-cases (create, copies, reflow). No canvas platform here — these
// are just numbers and functions over them, so they port unchanged.

export const SPEC_WIDTH = 560;
export const SPEC_MARGIN = 20;
export const SPEC_GAP = 16;
export const SPEC_STACK_GAP = 100;
export const SPEC_COPY_WIDTH = 160;
export const SPEC_COPY_GAP = 30;

// The on-canvas "+" button size. It is a layout constant (chrome is placed
// relative to it), so it lives in the domain; the button's artwork lives in
// the adapter.
export const SPEC_ADD_SIZE = 36;

export const SPEC_ZONES = [
  { id: 'given', label: 'Given' },
  { id: 'when', label: 'When' },
  { id: 'then', label: 'Then' },
] as const;
export type SpecZoneId = (typeof SPEC_ZONES)[number]['id'];

// Zone heights are per-spec state: zones grow as copies are added, and the
// registry remembers the current heights (fresh specs start with defaults).
export type ZoneHeights = Record<SpecZoneId, number>;
export const DEFAULT_ZONE_HEIGHTS: ZoneHeights = { given: 240, when: 240, then: 280 };

export function specFrameHeight(heights: ZoneHeights): number {
  const zones = SPEC_ZONES.reduce((sum, zone) => sum + heights[zone.id], 0);
  return SPEC_MARGIN * 2 + zones + SPEC_GAP * (SPEC_ZONES.length - 1);
}

// Vertical extent of a zone, relative to the frame's top edge.
export function zoneExtent(
  heights: ZoneHeights,
  id: SpecZoneId,
): { top: number; height: number } {
  let top = SPEC_MARGIN;
  for (const zone of SPEC_ZONES) {
    if (zone.id === id) return { top, height: heights[zone.id] };
    top += heights[zone.id] + SPEC_GAP;
  }
  return { top: SPEC_MARGIN, height: heights.given };
}

export function zoneTitle(id: SpecZoneId): string {
  return SPEC_ZONES.find((zone) => zone.id === id)?.label ?? id;
}

export function zoneHeightsOf(zones: Partial<ZoneHeights> | undefined): ZoneHeights {
  return { ...DEFAULT_ZONE_HEIGHTS, ...(zones ?? {}) };
}

// Columns derive from the spec's current width, so widening the frame makes
// room for more copies per row (560px default -> two columns).
export function specColumns(width: number): number {
  return Math.max(1, Math.floor((width - 50) / (SPEC_COPY_WIDTH + SPEC_COPY_GAP)));
}

// The height a zone needs to hold `count` copies laid out in `columns`.
export function requiredZoneHeight(count: number, columns: number): number {
  const rows = Math.ceil(count / columns);
  return 40 + rows * (SPEC_COPY_WIDTH + 16) + 12;
}

// Frame-relative position of the copy at `index` within a zone whose top edge
// is `zoneTop`.
export function copyOffset(
  zoneTop: number,
  index: number,
  columns: number,
): { x: number; y: number } {
  return {
    x: 130 + (index % columns) * (SPEC_COPY_WIDTH + SPEC_COPY_GAP),
    y: zoneTop + 40 + SPEC_COPY_WIDTH / 2 + Math.floor(index / columns) * (SPEC_COPY_WIDTH + 16),
  };
}

// Frame-relative positions of a zone's chrome: the "+" button and the label.
export function zonePlusOffset(zoneTop: number): { x: number; y: number } {
  return { x: 24 + SPEC_ADD_SIZE / 2, y: zoneTop + 16 };
}
export function zoneLabelOffset(zoneTop: number): { x: number; y: number } {
  return { x: 128, y: zoneTop + 16 };
}
