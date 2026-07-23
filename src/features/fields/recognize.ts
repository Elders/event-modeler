// Resolves which selected elements the Fields editor could act on. Recognition
// must not rest on live per-item metadata alone: a board reopen can read that
// back empty for an element that was unquestionably typed when it was created,
// leaving a field-bearing block looking like a plain one. So each candidate is
// recognized from the most reliable source available, in priority order:
//
//   1. live element metadata — the live block type, authoritative when present;
//   2. the em-fields registry — the persisted canonical store of field-bearing
//      elements (keyed by element id), so anything that *has* fields is still
//      recognized even when its metadata read comes back empty;
//   3. a sticky's fill color — a typed sticky whose metadata didn't survive but
//      whose conventional color still denotes its block type.
//
// EVERY candidate is resolved, not just the first to match. This used to stop at
// the first hit and hand that one block back as "the" target — but Miro reports
// a selection in its own order, not click order, so with several blocks selected
// the editor showed an arbitrary one of them and edited it silently. The caller
// needs to know it found more than one; it can't ask for a single block without
// being told there are several.

import { stickyTypeForColor, type BlockType } from '../../domain/vocabulary';
import type { SelectionItem } from '../../ports/runtime';
import { services } from '../../services';
import { isFieldable, readFieldRecords } from './model';

export interface FieldTarget {
  id: string;
  type: BlockType;
}

// Only a sticky (card) or a screen/automation (image) can carry fields. Filtering
// on that before any read is what keeps resolving the whole selection as cheap as
// resolving one block: a screen is a title+image+box group, so selecting it hands
// us a text and a shape that could never be targets, and a slice is a frame that
// costs nothing to dismiss.
function couldCarryFields(item: SelectionItem): boolean {
  return item.kind === 'card' || item.kind === 'image';
}

export async function resolveFieldTargets(items: SelectionItem[]): Promise<FieldTarget[]> {
  const candidates = items.filter(couldCarryFields);
  if (candidates.length === 0) return [];
  const { canvas } = services();

  const found = new Map<string, BlockType>();
  let unresolved: SelectionItem[] = [];

  // Live metadata recognizes most elements, one read each. Trying it first —
  // before the registry and color reads below — is what keeps the Properties tab
  // responsive when the panel opens on a fresh board, where every extra
  // round-trip is slow (the SDK bridge is warming up and competing for the API
  // budget) and would visibly delay the fields appearing.
  for (const item of candidates) {
    const meta = await canvas.getMeta(item.id);
    if (meta && isFieldable(meta.type)) found.set(item.id, meta.type);
    else unresolved.push(item);
  }

  // The fallbacks run only for what metadata didn't recognize, so a selection of
  // ordinary typed blocks still costs one read each and nothing more.
  if (unresolved.length > 0) {
    const typeByElement = new Map(
      (await readFieldRecords()).map((record) => [record.element, record.type] as const),
    );
    const remaining: SelectionItem[] = [];
    for (const item of unresolved) {
      const registered = typeByElement.get(item.id);
      if (registered && isFieldable(registered)) found.set(item.id, registered);
      else remaining.push(item);
    }
    unresolved = remaining;
  }

  const cardIds = unresolved.filter((item) => item.kind === 'card').map((item) => item.id);
  if (cardIds.length > 0) {
    for (const element of await canvas.get(cardIds)) {
      const byColor = stickyTypeForColor(element.color);
      if (byColor && isFieldable(byColor)) found.set(element.id, byColor);
    }
  }

  return [...found].map(([id, type]) => ({ id, type }));
}
