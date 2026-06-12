// Creating specifications: a Given-When-Then frame, standalone or placed
// beneath a slice. The zones are marked only by small text labels — keeping
// the frame body empty means dragging anywhere on the spec moves the whole
// frame, instead of pulling a zone shape out of it.

import { writeAppData } from '../../miro/appData';
import { META_KEY, ensureVisible, viewportCenter, type FrameItem } from '../../miro/helpers';
import { PLUS_ICON_URL, SPEC_ADD_SIZE } from '../../miro/icons';
import {
  DEFAULT_ZONE_HEIGHTS,
  SPECS_KEY,
  SPEC_STACK_GAP,
  SPEC_WIDTH,
  SPEC_ZONES,
  readSpecRecords,
  specFrameHeight,
  zoneExtent,
} from './model';

export async function addSpecification() {
  type SelectionItem = Awaited<ReturnType<typeof miro.board.getSelection>>[number];
  const selection = await miro.board.getSelection();
  const slice = selection.find(
    (item): item is Extract<SelectionItem, { type: 'frame' }> => item.type === 'frame',
  );
  return createSpecification(slice ?? null);
}

export async function createSpecification(slice: FrameItem | null) {
  const height = specFrameHeight(DEFAULT_ZONE_HEIGHTS);
  let x: number;
  let y: number;
  let title = 'Specification';
  if (slice) {
    x = slice.x;
    // Stack below whatever already hangs under this slice, not on top of it.
    let bottom = slice.y + slice.height / 2;
    const frames = await miro.board.get({ type: 'frame' });
    for (const other of frames) {
      if (other.id === slice.id) continue;
      const horizontalOverlap = Math.abs(other.x - slice.x) < (other.width + slice.width) / 2;
      if (horizontalOverlap && other.y > slice.y) {
        bottom = Math.max(bottom, other.y + other.height / 2);
      }
    }
    y = bottom + SPEC_STACK_GAP + height / 2;
    title = `${slice.title}: specification`;
  } else {
    const center = await viewportCenter();
    x = center.x;
    y = center.y;
  }

  const frame = await miro.board.createFrame({
    title,
    x,
    y,
    width: SPEC_WIDTH,
    height,
    style: { fillColor: '#ffffff' },
  });

  const frameTop = y - height / 2;
  const frameLeft = x - SPEC_WIDTH / 2;
  // The six zone children are independent of each other, so they're created
  // in parallel — every awaited SDK call is a round-trip, and the sequential
  // version took over a second to render a spec.
  //
  // Each child is created at its absolute position first, so the layout is
  // right even if re-parenting fails; after add() the coordinates are re-set
  // relative to the frame's top-left corner, which is how children are
  // positioned. The + sits at the left margin, next to its label — docked to
  // the right edge it would travel with the border on every resize.
  const chromeIds = await Promise.all(
    SPEC_ZONES.flatMap((zone) => {
      const { top } = zoneExtent(DEFAULT_ZONE_HEIGHTS, zone.id);
      const makePlus = async () => {
        const plus = await miro.board.createImage({
          url: PLUS_ICON_URL,
          x: frameLeft + 24 + SPEC_ADD_SIZE / 2,
          y: frameTop + top + 16,
          width: SPEC_ADD_SIZE,
        });
        await plus.setMetadata(META_KEY, { type: 'spec-add', zone: zone.id, spec: frame.id });
        try {
          await frame.add(plus);
          plus.x = 24 + SPEC_ADD_SIZE / 2;
          plus.y = top + 16;
          await plus.sync();
        } catch (error) {
          console.warn('Could not attach a zone button to its frame', error);
        }
        return plus.id;
      };
      const makeLabel = async () => {
        const label = await miro.board.createText({
          content: zone.label,
          x: frameLeft + 128,
          y: frameTop + top + 16,
          width: 120,
          style: { color: '#9c9cac', fontSize: 14, textAlign: 'left' },
        });
        try {
          await frame.add(label);
          label.x = 128;
          label.y = top + 16;
          await label.sync();
        } catch (error) {
          console.warn('Could not attach a specification label to its frame', error);
        }
        return label.id;
      };
      return [makePlus(), makeLabel()];
    }),
  );

  const records = await readSpecRecords();
  await writeAppData(SPECS_KEY, [
    ...records,
    { frame: frame.id, labels: chromeIds, zones: { ...DEFAULT_ZONE_HEIGHTS }, width: SPEC_WIDTH },
  ]);

  await ensureVisible([frame]);
  return frame;
}
