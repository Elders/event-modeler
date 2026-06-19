// The periodic background pass for fields, run from the headless board script:
// cleans up after deleted elements, recreates boxes that were deleted or
// evicted, re-docks boxes that drifted, and re-renders a display that no longer
// matches the registry (a manual text edit, or a teammate's change). Polling is
// the only option — there are no item-update or item-delete events.

import {
  FIELDS_BOX_GAP,
  fieldsBoxHeight,
  formatField,
  htmlToLines,
  type Field,
} from '../../domain/fields';
import { type FieldRecord } from '../../domain/records';
import type { CanvasElement } from '../../ports/canvas';
import { services } from '../../services';
import { displayMode, readFieldRecords, writeFieldRecords } from './model';
import { removeFieldsDisplay, renderFields } from './render';

let running = false;

export async function fieldsHousekeeping(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await doFieldsHousekeeping();
  } catch (error) {
    // A retry-exhausted rate-limit (or any failure) must not surface as an
    // unhandled rejection; the next tick retries from a clean state.
    console.warn('Fields housekeeping failed', error);
  } finally {
    running = false;
  }
}

async function doFieldsHousekeeping(): Promise<void> {
  const { canvas } = services();
  const records = await readFieldRecords();
  if (records.length === 0) return;

  // One batched fetch of every element and existing box the registry references.
  const ids = new Set<string>();
  for (const record of records) {
    ids.add(record.element);
    if (record.card) ids.add(record.card);
  }
  const live = new Map((await canvas.get([...ids])).map((el) => [el.id, el] as const));

  const survivors: FieldRecord[] = [];
  let dirty = false;
  for (const record of records) {
    const element = live.get(record.element);
    if (!element) {
      // The element was deleted — drop its box (box mode) and prune the record.
      await removeFieldsDisplay(record);
      dirty = true;
      continue;
    }
    survivors.push(record);
    if (needsRender(record, element, record.card ? live.get(record.card) ?? null : null)) {
      const before = record.card;
      await renderFields(record, element);
      if (record.card !== before) dirty = true;
    }
  }

  if (dirty) await writeFieldRecords(survivors);
}

// Whether the on-board display is out of sync with the registry. Text-mode
// fields are user-authoritative — manual edits on the sticky are reconciled into
// the registry on selection (sync.ts), so housekeeping must never overwrite
// them. Only the box display is registry-driven and healed here.
function needsRender(
  record: FieldRecord,
  element: CanvasElement,
  box: CanvasElement | null,
): boolean {
  if (displayMode(record.type) === 'text') return false;
  const expected = record.fields.map(formatField);
  if (!box || box.kind !== 'shape') return true;
  if (!linesEqual(expected, htmlToLines(box.content))) return true;
  return boxDrifted(element, box, record.fields);
}

function boxDrifted(element: CanvasElement, box: CanvasElement, fields: Field[]): boolean {
  const targetY = element.y + element.height / 2 + FIELDS_BOX_GAP + fieldsBoxHeight(fields.length) / 2;
  return Math.abs(box.x - element.x) > 1 || Math.abs(box.y - targetY) > 1;
}

function linesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}
