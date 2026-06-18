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
import { displayMode, type FieldRecord } from './model';

const BOX_FILL = '#ffffff';
const BOX_BORDER = '#dcdce5';
const BOX_TEXT = '#1a1a2e';

// Position the box centered under the element, leaving FIELDS_BOX_GAP between
// the element's bottom edge and the box's top edge.
function boxLayout(element: CanvasElement, fieldCount: number) {
  const width = Math.max(element.width, FIELDS_BOX_MIN_WIDTH);
  const height = fieldsBoxHeight(fieldCount);
  return {
    width,
    height,
    x: element.x,
    y: element.y + element.height / 2 + FIELDS_BOX_GAP + height / 2,
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
  const { x, y, width, height } = boxLayout(element, fields.length);
  const content = fieldsBoxContent(fields);

  if (existingId) {
    const [box] = await canvas.get([existingId]);
    if (box && box.kind === 'shape') {
      await canvas.apply([{ id: box.id, x, y, width, height, content }]);
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
    textAlign: 'left',
    textAlignVertical: 'top',
  });
  // Group with the element so moving the element moves the box. Grouping is
  // cosmetic cohesion (the adapter swallows failures); housekeeping re-docks the
  // box position as the safety net if the group didn't take.
  await canvas.group([element.id, box.id]);
  return box.id;
}

// Clears an element's field display: removes the box (box mode), or rewrites the
// sticky's text back to just its name (text mode).
export async function removeFieldsDisplay(record: FieldRecord): Promise<void> {
  const { canvas } = services();
  if (displayMode(record.type) === 'box') {
    if (record.card) await canvas.remove(record.card);
    return;
  }
  const [element] = await canvas.get([record.element]);
  if (element) {
    await canvas.apply([{ id: element.id, content: renderStickyContent(extractName(element.content), []) }]);
  }
}
