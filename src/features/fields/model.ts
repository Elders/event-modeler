// The fields use-case's view of its model: the pure field domain re-exported,
// plus the store-backed registry read and the small policy that decides which
// blocks can carry fields and how each one displays them. Feature modules
// import field geometry and persistence through this one door.

export * from '../../domain/fields';
export { FIELDS_KEY, type FieldRecord } from '../../domain/records';

import { FIELDS_KEY, normalizeFieldRecords, type FieldRecord } from '../../domain/records';
import type { Field } from '../../domain/fields';
import type { BlockType } from '../../domain/vocabulary';
import { services } from '../../services';

// How a block shows its fields: stickies embed them in their own text; the
// image-based blocks (screens, automations) get an attached box beneath them.
export type FieldDisplayMode = 'text' | 'box';

const TEXT_TYPES: BlockType[] = ['command', 'event', 'readModel'];
const BOX_TYPES: BlockType[] = ['screen', 'automation'];
const FIELDABLE: BlockType[] = [...TEXT_TYPES, ...BOX_TYPES];

// True for the blocks that can carry fields (external events and errors can't,
// by product decision). Narrows the loose meta type union down to BlockType.
export function isFieldable(type: string | null | undefined): type is BlockType {
  return !!type && (FIELDABLE as string[]).includes(type);
}

export function displayMode(type: BlockType): FieldDisplayMode {
  return (TEXT_TYPES as string[]).includes(type) ? 'text' : 'box';
}

export async function readFieldRecords(): Promise<FieldRecord[]> {
  return normalizeFieldRecords(await services().store.read<unknown>(FIELDS_KEY, []));
}

export function recordFor(records: FieldRecord[], elementId: string): FieldRecord | undefined {
  return records.find((record) => record.element === elementId);
}

// The fields currently defined for one element (empty when none) — used by the
// panel editor to populate itself on selection.
export async function loadFields(elementId: string): Promise<Field[]> {
  const records = await readFieldRecords();
  return recordFor(records, elementId)?.fields ?? [];
}
