// The fields use-case's view of its model: the pure field domain re-exported,
// plus the store-backed registry read and the small policy that decides which
// blocks can carry fields and how each one displays them. Feature modules
// import field geometry and persistence through this one door.

export * from '../../domain/fields';
export { FIELDS_KEY, type FieldRecord } from '../../domain/records';

import { FIELDS_KEY, normalizeFieldRecords, type FieldRecord } from '../../domain/records';
import { storableField, type Field } from '../../domain/fields';
import type { BlockType } from '../../domain/vocabulary';
import { services } from '../../services';

// How a block shows its fields: stickies embed them in their own text; the
// image-based blocks (screens, automations) get an attached box beneath them.
export type FieldDisplayMode = 'text' | 'box';

const TEXT_TYPES: BlockType[] = ['command', 'event', 'readModel', 'externalEvent'];
const BOX_TYPES: BlockType[] = ['screen', 'automation'];
const FIELDABLE: BlockType[] = [...TEXT_TYPES, ...BOX_TYPES];

// True for the blocks that can carry fields (errors can't, by product
// decision). Narrows the loose meta type union down to BlockType.
export function isFieldable(type: string | null | undefined): type is BlockType {
  return !!type && (FIELDABLE as string[]).includes(type);
}

export function displayMode(type: BlockType): FieldDisplayMode {
  return (TEXT_TYPES as string[]).includes(type) ? 'text' : 'box';
}

export async function readFieldRecords(): Promise<FieldRecord[]> {
  return normalizeFieldRecords(await services().store.read<unknown>(FIELDS_KEY, []));
}

// The single write boundary for the field registry: persists every record in its
// compact form (per-field ids stripped), so no caller can accidentally re-store
// the regenerated ids and re-bloat app-data.
export async function writeFieldRecords(records: FieldRecord[]): Promise<void> {
  const compact = records.map((record) => ({
    ...record,
    fields: record.fields.map(storableField),
  }));
  await services().store.write(FIELDS_KEY, compact);
}

// One-time migration, run on board load: brings the registry to its current
// shape. Two legacy forms are cleaned up — records that still embed a per-field
// id (an older build inflated the registry with them), and text-mode (sticky)
// records, which are no longer kept since a sticky's fields live in its own text.
// The rewrite is size-reducing, so it goes through even when app-data is over
// budget. Skipped once the stored data already matches.
export async function compactFieldRegistry(): Promise<void> {
  const raw = await services().store.read<unknown>(FIELDS_KEY, []);
  if (!Array.isArray(raw)) return;
  const records = normalizeFieldRecords(raw);
  const boxOnly = records.filter((record) => displayMode(record.type) === 'box');
  const hasPersistedId = raw.some(
    (entry) =>
      !!entry &&
      Array.isArray((entry as FieldRecord).fields) &&
      (entry as FieldRecord).fields.some((field) => typeof (field as Field).id === 'string'),
  );
  if (boxOnly.length === records.length && !hasPersistedId) return; // already current
  await writeFieldRecords(boxOnly);
}

export function recordFor(records: FieldRecord[], elementId: string): FieldRecord | undefined {
  return records.find((record) => record.element === elementId);
}
