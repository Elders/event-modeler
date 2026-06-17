// Creating specifications: a Given-When-Then container, standalone or placed
// inside a slice. The zones are marked only by small text labels — keeping the
// container body empty means dragging anywhere on the spec moves the whole
// thing, instead of pulling a zone out of it.

import { sliceSpecPlacement } from '../../domain/slice';
import type { CanvasElement } from '../../ports/canvas';
import { services } from '../../services';
import { PLUS_ICON_URL } from '../assets';
import { ensureVisible, viewportCenter } from '../helpers';
import { readSliceRecords, redockSliceButton } from '../slices';
import {
  DEFAULT_ZONE_HEIGHTS,
  SPECS_KEY,
  SPEC_ADD_SIZE,
  SPEC_STACK_GAP,
  SPEC_WIDTH,
  SPEC_ZONES,
  readSpecRecords,
  specFrameHeight,
  zoneExtent,
  zoneLabelOffset,
  zonePlusOffset,
} from './model';

export async function addSpecification(): Promise<CanvasElement> {
  const { canvas } = services();
  const selection = await canvas.selection();
  const container = selection.find((item) => item.kind === 'container') ?? null;
  // Only a real slice gets the in-slice placement (which grows the slice); any
  // other selected frame would just be resized, so fall back to a standalone spec.
  if (container) {
    const slices = await readSliceRecords();
    if (slices.some((record) => record.frame === container.id)) {
      return createSpecification(container);
    }
  }
  return createSpecification(null);
}

export async function createSpecification(
  slice: CanvasElement | null,
  at?: { x: number; y: number },
): Promise<CanvasElement> {
  const { canvas, store } = services();
  const height = specFrameHeight(DEFAULT_ZONE_HEIGHTS);
  const specRecords = await readSpecRecords();
  let x: number;
  let y: number;
  let title = 'Specification';
  // When placed in a slice, the slice grows downward to enclose the new spec.
  let liveSlice: CanvasElement | null = null;
  let grownSlice: { sliceHeight: number; sliceY: number } | null = null;
  if (slice) {
    // Read the slice's live geometry — the caller's snapshot can be stale (the
    // generator reuses one slice for several specs, each of which grew it).
    const frames = await canvas.containers();
    liveSlice = frames.find((frame) => frame.id === slice.id) ?? slice;
    x = liveSlice.x;
    // Stack the new spec below whatever already sits inside this slice: the
    // lowest spec already placed, or — for the first — the slice's own bottom
    // edge (i.e. just past the model content the slice contains).
    const sliceTop = liveSlice.y - liveSlice.height / 2;
    const sliceBottom = liveSlice.y + liveSlice.height / 2;
    const specIds = new Set(specRecords.map((record) => record.frame));
    let contentBottom = sliceBottom;
    for (const other of frames) {
      if (other.id === liveSlice.id || !specIds.has(other.id)) continue;
      const overlaps = Math.abs(other.x - liveSlice.x) < (other.width + liveSlice.width) / 2;
      const within = other.y > sliceTop && other.y < sliceBottom;
      if (overlaps && within) contentBottom = Math.max(contentBottom, other.y + other.height / 2);
    }
    const placement = sliceSpecPlacement(liveSlice, contentBottom, height, SPEC_STACK_GAP);
    y = placement.specY;
    grownSlice = { sliceHeight: placement.sliceHeight, sliceY: placement.sliceY };
    title = `${liveSlice.title ?? 'Slice'}: specification`;
  } else {
    const center = at ?? (await viewportCenter());
    x = center.x;
    y = center.y;
  }

  const frame = await canvas.createContainer({
    title,
    x,
    y,
    width: SPEC_WIDTH,
    height,
    fill: '#ffffff',
  });

  const frameTop = y - height / 2;
  const frameLeft = x - SPEC_WIDTH / 2;
  // The six zone children are independent, so they're created in parallel —
  // every awaited round-trip adds up, and the sequential version took over a
  // second to render a spec. Each child is created at its absolute position
  // (right even if re-parenting fails), then re-pinned relative to the frame.
  const chromeIds = await Promise.all(
    SPEC_ZONES.flatMap((zone) => {
      const { top } = zoneExtent(DEFAULT_ZONE_HEIGHTS, zone.id);
      const plusOffset = zonePlusOffset(top);
      const labelOffset = zoneLabelOffset(top);
      const makePlus = async () => {
        const plus = await canvas.createImage({
          url: PLUS_ICON_URL,
          x: frameLeft + plusOffset.x,
          y: frameTop + plusOffset.y,
          width: SPEC_ADD_SIZE,
        });
        await canvas.setMeta(plus.id, { type: 'spec-add', zone: zone.id, spec: frame.id });
        await canvas.addToContainer(frame.id, plus.id, plusOffset.x, plusOffset.y);
        return plus.id;
      };
      const makeLabel = async () => {
        const label = await canvas.createText({
          content: zone.label,
          x: frameLeft + labelOffset.x,
          y: frameTop + labelOffset.y,
          width: 120,
          color: '#9c9cac',
          fontSize: 14,
          align: 'left',
        });
        await canvas.addToContainer(frame.id, label.id, labelOffset.x, labelOffset.y);
        return label.id;
      };
      return [makePlus(), makeLabel()];
    }),
  );

  await store.write(SPECS_KEY, [
    ...specRecords,
    { frame: frame.id, labels: chromeIds, zones: { ...DEFAULT_ZONE_HEIGHTS }, width: SPEC_WIDTH },
  ]);

  // The spec was created just past the slice's current bottom (so it isn't
  // captured by the slice). Now grow the slice downward to enclose it, then
  // re-dock the slice's add-spec button to the new bottom edge.
  if (liveSlice && grownSlice) {
    await canvas.apply([
      { id: liveSlice.id, y: grownSlice.sliceY, height: grownSlice.sliceHeight },
    ]);
    const sliceRecords = await readSliceRecords();
    const sliceRecord = sliceRecords.find((record) => record.frame === liveSlice.id);
    if (sliceRecord) {
      const grown = { ...liveSlice, y: grownSlice.sliceY, height: grownSlice.sliceHeight };
      await redockSliceButton(grown, sliceRecord, sliceRecords);
    }
  }

  await ensureVisible([frame]);
  return frame;
}
