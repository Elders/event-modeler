// Reading an element's fields from what's actually drawn on the board — the
// sticky's own text, or the attached box — independent of the registry. The
// em-fields registry is a lazily-populated cache (filled when the panel touches
// an element or the generator runs); the board is the source of truth. Both the
// panel's reconcile and the headless completeness check read fields this way so
// they stay correct even when a registry record is missing.

import { parseStickyFields, type Field } from '../../domain/fields';
import { stickyTypeForColor } from '../../domain/vocabulary';
import type { CanvasElement } from '../../ports/canvas';
import { services } from '../../services';
import { isFieldable } from './model';

// The shape among `candidates` that carries the fields-box tag, or null. Only a
// tagged shape is ever treated as a fields box: a user-drawn shape grouped with
// the same element must never be mistaken for one — it would get parsed as
// fields, rewritten, resized, re-docked, and eventually evicted.
export async function fieldsBoxAmong(candidates: CanvasElement[]): Promise<CanvasElement | null> {
  const { canvas } = services();
  for (const candidate of candidates) {
    if (candidate.kind !== 'shape') continue;
    const meta = await canvas.getMeta(candidate.id);
    if (meta?.type === 'fields-box') return candidate;
  }
  return null;
}

// An element's attached fields box: the known box if it still exists (the id
// comes from the registry, which only ever points at app-created boxes), else
// the tagged shape among the element's group members.
export async function findFieldsBox(
  elementId: string,
  knownBoxId: string | null = null,
): Promise<CanvasElement | null> {
  const { canvas } = services();
  if (knownBoxId) {
    const [box] = await canvas.get([knownBoxId]);
    if (box && box.kind === 'shape') return box;
  }
  const memberIds = (await canvas.groupMembers(elementId)).filter((id) => id !== elementId);
  if (memberIds.length === 0) return null;
  return fieldsBoxAmong(await canvas.get(memberIds));
}

// The fields a sticky displays in its own text, or [] if it isn't a fieldable
// typed sticky (block type recovered from the fill color). Synchronous — the
// element snapshot already carries everything needed — so a caller that has
// already fetched a batch of elements can read them without more round-trips.
export function stickyFields(element: CanvasElement): Field[] {
  if (element.kind !== 'card') return [];
  const type = stickyTypeForColor(element.color);
  return type && isFieldable(type) ? parseStickyFields(element.content) : [];
}
