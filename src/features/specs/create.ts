// Creating specifications: a Given-When-Then container, standalone or placed
// beneath a slice. The zones are marked only by small text labels — keeping the
// container body empty means dragging anywhere on the spec moves the whole
// thing, instead of pulling a zone out of it.

import type { CanvasElement } from '../../ports/canvas';
import { services } from '../../services';
import { PLUS_ICON_URL } from '../assets';
import { ensureVisible, viewportCenter } from '../helpers';
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
  const slice = selection.find((item) => item.kind === 'container') ?? null;
  return createSpecification(slice);
}

export async function createSpecification(
  slice: CanvasElement | null,
  at?: { x: number; y: number },
): Promise<CanvasElement> {
  const { canvas, store } = services();
  const height = specFrameHeight(DEFAULT_ZONE_HEIGHTS);
  let x: number;
  let y: number;
  let title = 'Specification';
  if (slice) {
    x = slice.x;
    // Stack below whatever already hangs under this slice, not on top of it.
    let bottom = slice.y + slice.height / 2;
    const frames = await canvas.containers();
    for (const other of frames) {
      if (other.id === slice.id) continue;
      const horizontalOverlap = Math.abs(other.x - slice.x) < (other.width + slice.width) / 2;
      if (horizontalOverlap && other.y > slice.y) {
        bottom = Math.max(bottom, other.y + other.height / 2);
      }
    }
    y = bottom + SPEC_STACK_GAP + height / 2;
    title = `${slice.title ?? 'Slice'}: specification`;
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

  const records = await readSpecRecords();
  await store.write(SPECS_KEY, [
    ...records,
    { frame: frame.id, labels: chromeIds, zones: { ...DEFAULT_ZONE_HEIGHTS }, width: SPEC_WIDTH },
  ]);

  await ensureVisible([frame]);
  return frame;
}
