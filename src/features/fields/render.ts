// Renders an element's fields onto the board. Stickies embed the fields in
// their own text (keeping whatever name the user typed); screens and
// automations get an attached box beneath them, grouped so it travels with the
// element. The box upsert is self-healing — if a teammate or a frame-shrink
// deleted the box, it is recreated — mirroring redockSliceButton in slices.ts.

import {
  FIELDS_BOX_FONT,
  FIELDS_BOX_GAP,
  FIELDS_BOX_MIN_WIDTH,
  extractName,
  fieldsBoxContent,
  fieldsBoxHeight,
  renderStickyContent,
  type Field,
} from '../../domain/fields';
import type { CanvasElement } from '../../ports/canvas';
import { services } from '../../services';
import { absoluteCenter, localCenterIn } from '../helpers';
import { forgetFieldsBox, rememberFieldsBox } from './boxTags';
import { displayMode, type FieldRecord } from './model';

const BOX_FILL = '#ffffff';
const BOX_BORDER = '#dcdce5';
const BOX_TEXT = '#1a1a2e';

// The box sits centered under the element, FIELDS_BOX_GAP below its bottom edge.
// Position is returned in ABSOLUTE coordinates: the element may be a child of a
// slice frame — in which case its own x/y are frame-relative — and the box is a
// separate element with its own, possibly different, parent, so absolute is the
// only frame of reference the two share. `center` is the element's absolute
// center; the box's parent decides how the result is written back to the board.
export function boxLayout(
  element: CanvasElement,
  center: { x: number; y: number },
  fieldCount: number,
) {
  const width = Math.max(element.width, FIELDS_BOX_MIN_WIDTH);
  const height = fieldsBoxHeight(fieldCount);
  return {
    width,
    height,
    x: center.x,
    y: center.y + element.height / 2 + FIELDS_BOX_GAP + height / 2,
  };
}

// Writes the display for a record, mutating record.card to the box id (box
// mode) or null (text mode). The caller persists the record afterwards.
export async function renderFields(record: FieldRecord, element?: CanvasElement): Promise<void> {
  const { canvas } = services();
  const el = element ?? (await canvas.get([record.element]))[0];
  if (!el) return;
  if (displayMode(record.type) === 'text') {
    await renderStickyFields(el, record.fields);
    record.card = null;
  } else {
    record.card = await upsertBox(el, record.fields, record.card ?? null);
  }
}

async function renderStickyFields(element: CanvasElement, fields: Field[]): Promise<void> {
  const { canvas } = services();
  const name = extractName(element.content);
  await canvas.apply([{ id: element.id, content: renderStickyContent(name, fields) }]);
}

async function upsertBox(
  element: CanvasElement,
  fields: Field[],
  existingId: string | null,
): Promise<string> {
  const { canvas } = services();
  const { x, y, width, height } = boxLayout(element, await absoluteCenter(element), fields.length);
  const content = fieldsBoxContent(fields);

  if (existingId) {
    const [box] = await canvas.get([existingId]);
    if (box && box.kind === 'shape') {
      // x/y are absolute; the box has its own parent (a slice can capture it),
      // so write the target in the box's own space rather than the element's.
      const local = await toBoxLocal(box, x, y);
      await canvas.apply([
        {
          id: box.id,
          x: local.x,
          y: local.y,
          width,
          height,
          content,
          fontSize: FIELDS_BOX_FONT,
          textAlign: 'center',
          textAlignVertical: 'middle',
        },
      ]);
      return box.id;
    }
  }

  const box = await canvas.createShape({
    shape: 'rectangle',
    x,
    y,
    width,
    height,
    content,
    fill: BOX_FILL,
    borderColor: BOX_BORDER,
    borderWidth: 1,
    textColor: BOX_TEXT,
    fontSize: FIELDS_BOX_FONT,
    textAlign: 'center',
    textAlignVertical: 'middle',
  });
  // Tag the box so the recovery scan and the completeness check can tell it
  // apart from a user-drawn shape grouped with the same element. Recording it
  // locally too saves those lookups a metadata read for a box we just tagged.
  await canvas.setMeta(box.id, { type: 'fields-box' });
  rememberFieldsBox(box.id);
  // A box created over a slice frame can be auto-captured, its coordinates then
  // read as frame-relative though we supplied absolute — re-pin it to the
  // intended absolute spot, exactly as screens and their titles do (see
  // createSketchScreen / addTitleAbove). Without this, a box that lands inside a
  // slice on creation is shifted by the frame's top-left.
  await canvas.settle(box.id, x, y);
  // Group the box with the element *and its existing group members* — a screen
  // or automation is already a title+image group, so grouping the box with the
  // image alone would split the image out and orphan the title. Re-grouping the
  // whole set keeps title, image, and box moving as one. Grouping is cosmetic
  // cohesion (the adapter swallows failures); housekeeping re-docks the box
  // position as the safety net if the group didn't take.
  const members = await canvas.groupMembers(element.id);
  await canvas.group([...new Set([...members, box.id])]);
  return box.id;
}

// An absolute point expressed in a box's own coordinate space — the point
// itself when the box is unparented, or frame-relative when a slice has
// captured it. The one write path that has to bridge the box's space and the
// element's, since the two can have different parents.
async function toBoxLocal(
  box: CanvasElement,
  absX: number,
  absY: number,
): Promise<{ x: number; y: number }> {
  if (!box.parentId) return { x: absX, y: absY };
  const [parent] = await services().canvas.get([box.parentId]);
  return localCenterIn(absX, absY, parent ?? null);
}

// Clears an element's field display: removes the box (box mode), or rewrites the
// sticky's text back to just its name (text mode).
export async function removeFieldsDisplay(record: FieldRecord): Promise<void> {
  const { canvas } = services();
  if (displayMode(record.type) === 'box') {
    if (record.card) {
      await canvas.remove(record.card);
      forgetFieldsBox(record.card); // only after the removal actually landed
    }
    return;
  }
  const [element] = await canvas.get([record.element]);
  if (element) {
    await canvas.apply([{ id: element.id, content: renderStickyContent(extractName(element.content), []) }]);
  }
}
