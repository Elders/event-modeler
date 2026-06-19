// Resolves which selected element the Fields editor should act on. Recognition
// must not rest on live per-item metadata alone: a board reopen can read that
// back empty for an element that was unquestionably typed when it was created,
// leaving a field-bearing block looking like a plain one. So each selected item
// is recognized from the most reliable source available, in priority order:
//
//   1. live element metadata — the live block type, authoritative when present;
//   2. the em-fields registry — the persisted canonical store of field-bearing
//      elements (keyed by element id), so anything that *has* fields is still
//      recognized even when its metadata read comes back empty;
//   3. a sticky's fill color — a typed sticky whose metadata didn't survive but
//      whose conventional color still denotes its block type.
//
// The first item that resolves wins, mirroring the original first-fieldable scan.

import { stickyTypeForColor, type BlockType } from '../../domain/vocabulary';
import type { SelectionItem } from '../../ports/runtime';
import { services } from '../../services';
import { isFieldable, readFieldRecords } from './model';

export interface FieldTarget {
  id: string;
  type: BlockType;
}

export async function resolveFieldTarget(items: SelectionItem[]): Promise<FieldTarget | null> {
  if (items.length === 0) return null;
  const { canvas } = services();

  // Fast path: live metadata recognizes most elements, one read each. Trying it
  // first — before the registry and color reads below — is what keeps the Fields
  // tab responsive when the panel opens on a fresh board, where every extra
  // round-trip is slow (the SDK bridge is warming up and competing for the API
  // budget) and would visibly delay the fields appearing.
  for (const item of items) {
    const meta = await canvas.getMeta(item.id);
    if (meta && isFieldable(meta.type)) return { id: item.id, type: meta.type };
  }

  // Fallbacks for an element whose metadata didn't read back: the persisted
  // field registry (keyed by element id), then a sticky's fill color. These
  // extra reads happen only when metadata recognized nothing.
  const typeByElement = new Map(
    (await readFieldRecords()).map((record) => [record.element, record.type] as const),
  );
  for (const item of items) {
    const registered = typeByElement.get(item.id);
    if (registered && isFieldable(registered)) return { id: item.id, type: registered };
  }

  const cardIds = items.filter((item) => item.kind === 'card').map((item) => item.id);
  if (cardIds.length === 0) return null;
  for (const element of await canvas.get(cardIds)) {
    const byColor = stickyTypeForColor(element.color);
    if (byColor && isFieldable(byColor)) return { id: element.id, type: byColor };
  }
  return null;
}
