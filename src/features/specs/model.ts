// Specification model: zone vocabulary, geometry, and registry access shared
// by the spec components (create, copies, reflow, selection, housekeeping).

import { readRecordsFor, type FrameRecord } from '../../miro/appData';

export const SPEC_WIDTH = 560;
export const SPEC_MARGIN = 20;
export const SPEC_GAP = 16;
export const SPEC_STACK_GAP = 100;
export const SPEC_COPY_WIDTH = 160;
export const SPEC_COPY_GAP = 30;

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

export function zoneHeightsOf(record: FrameRecord | undefined): ZoneHeights {
  return { ...DEFAULT_ZONE_HEIGHTS, ...(record?.zones ?? {}) };
}

// Columns derive from the spec's current width, so widening the frame makes
// room for more copies per row (560px default → two columns).
export function specColumns(width: number): number {
  return Math.max(1, Math.floor((width - 50) / (SPEC_COPY_WIDTH + SPEC_COPY_GAP)));
}

export const SPECS_KEY = 'em-specs';
export const LINKS_KEY = 'em-links';
export type SpecLink = { source: string; copy: string; spec?: string };

export async function readSpecRecords(): Promise<FrameRecord[]> {
  return readRecordsFor(SPECS_KEY);
}
