// Reads an element's fields for the panel from what's drawn on the board, and
// keeps the registry following it.
//
// Text mode (stickies): the sticky's own text is the only store, so the fields
// are simply parsed out of it — nothing to persist or reconcile.
//
// Box mode (screens/automations): the attached box's text is just as
// user-authoritative — `name : type` lines edited directly in the box are
// adopted into the registry record, never overwritten, and deleting every line
// clears the fields the same way it does on a sticky. (The record exists so
// housekeeping can rebuild a box that a frame-shrink evicted or deleted; it is
// a follower, not the source of truth.) This read path never deletes anything
// itself — evicting the emptied box (an empty box has nothing to show) is
// housekeeping's job, one tick later.

import { parseBoxFields, parseStickyFields, sameFields, type Field } from '../../domain/fields';
import type { FieldRecord } from '../../domain/records';
import type { BlockType } from '../../domain/vocabulary';
import { services } from '../../services';
import { findFieldsBox } from './board';
import { readFieldRecords, recordFor, writeFieldRecords, displayMode } from './model';

export async function syncFieldsFromBoard(elementId: string, type: BlockType): Promise<Field[]> {
  return displayMode(type) === 'text' ? syncStickyText(elementId) : syncBoxFields(elementId, type);
}

async function syncStickyText(elementId: string): Promise<Field[]> {
  const { canvas } = services();
  const [element] = await canvas.get([elementId]);
  return element ? parseStickyFields(element.content) : [];
}

async function syncBoxFields(elementId: string, type: BlockType): Promise<Field[]> {
  const records = await readFieldRecords();
  const existing = recordFor(records, elementId);

  // No box on the board (deleted, evicted, or none yet): the registry is the
  // only memory left — return it and let housekeeping rebuild the box from it.
  const box = await findFieldsBox(elementId, existing?.card ?? null);
  if (!box) return existing?.fields ?? [];

  const parsed = parseBoxFields(box.content, existing?.fields ?? []);

  // Adopt the box's text into the registry when they disagree, pointing the
  // record at the box that's already on the board so housekeeping reuses it
  // rather than creating a second one.
  if (existing && existing.card === box.id && sameFields(parsed, existing.fields)) return parsed;
  const record: FieldRecord = { element: elementId, type, fields: parsed, card: box.id };
  await writeFieldRecords([...records.filter((r) => r.element !== elementId), record]);
  return parsed;
}
