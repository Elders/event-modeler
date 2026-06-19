// Reads an element's fields for the panel from what's on the board.
//
// Text mode (stickies): the sticky's own text is the only store, so the fields
// are simply parsed out of it — nothing to persist or reconcile.
//
// Box mode (screens/automations): the fields live in the registry record (the
// box is rendered from it). The record is healed from the attached box when it's
// missing — e.g. after a board where it was never written — pointing at the
// existing box so no duplicate is created.

import { parseBoxFields, parseStickyFields, type Field } from '../../domain/fields';
import type { FieldRecord } from '../../domain/records';
import type { BlockType } from '../../domain/vocabulary';
import { services } from '../../services';
import { findFieldsBox } from './board';
import { displayMode, readFieldRecords, recordFor, writeFieldRecords } from './model';

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
  // The registry stays authoritative whenever it has fields — the box display is
  // registry-driven, so only a missing/empty record needs recovery.
  if (existing && existing.fields.length > 0) return existing.fields;

  const box = await findFieldsBox(elementId, existing?.card ?? null);
  if (!box) return existing?.fields ?? [];
  const parsed = parseBoxFields(box.content, existing?.fields ?? []);
  if (parsed.length === 0) return existing?.fields ?? [];

  // Heal the registry from the box, pointing the record at the box that's already
  // on the board so housekeeping reuses it rather than creating a second one.
  const record: FieldRecord = { element: elementId, type, fields: parsed, card: box.id };
  await writeFieldRecords([...records.filter((r) => r.element !== elementId), record]);
  return parsed;
}
