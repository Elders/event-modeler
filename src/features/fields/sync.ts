// Reconciles a text-mode element's on-canvas text back into the field registry.
// For stickies the canvas is authoritative — the user can type "name : type"
// lines directly on the block — so when the panel resolves a selected element it
// parses the sticky's text and, if it differs from what's stored, persists it.
// This is the inbound half of the editing loop (edit.ts is the outbound half);
// box-mode blocks have no editable field text, so they fall through to a plain
// registry read.

import { formatField, parseStickyFields, type Field } from '../../domain/fields';
import type { BlockType } from '../../domain/vocabulary';
import { services } from '../../services';
import { setFields } from './edit';
import { displayMode, loadFields, readFieldRecords, recordFor } from './model';

export async function syncFieldsFromText(elementId: string, type: BlockType): Promise<Field[]> {
  if (displayMode(type) !== 'text') return loadFields(elementId);
  const { canvas } = services();
  const [element] = await canvas.get([elementId]);
  if (!element) return [];
  const stored = recordFor(await readFieldRecords(), elementId)?.fields ?? [];
  const parsed = parseStickyFields(element.content, stored);
  if (sameFields(parsed, stored)) return stored;
  await setFields(elementId, type, parsed);
  return parsed;
}

// Equal when they render to the same lines — ignores ids, so a reconcile that
// only reused/regenerated ids doesn't trigger a needless write.
function sameFields(a: Field[], b: Field[]): boolean {
  return a.length === b.length && a.every((field, i) => formatField(field) === formatField(b[i]));
}
