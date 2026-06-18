// The create/edit/remove use-case behind the panel editor: upsert an element's
// field definitions in the registry and render them onto the board. An empty
// field list clears the display and drops the record.
//
// Calls are serialized through a promise chain: the editor persists on every
// keystroke-blur and type change, and each call does a read-modify-write of the
// shared registry — running them one at a time keeps last-write-wins correct
// and avoids a lost update from two overlapping writes.

import { FIELDS_KEY, readFieldRecords, recordFor, storableField, type Field } from './model';
import { removeFieldsDisplay, renderFields } from './render';
import type { BlockType } from '../../domain/vocabulary';
import { services } from '../../services';

let queue: Promise<unknown> = Promise.resolve();

export function setFields(elementId: string, type: BlockType, fields: Field[]): Promise<void> {
  const run = () => doSetFields(elementId, type, fields);
  // Chain on both fulfilment and rejection so one failure can't stall the queue.
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

async function doSetFields(elementId: string, type: BlockType, input: Field[]): Promise<void> {
  const { store } = services();
  // Strip undefined members (e.g. customType) — the app-data store rejects them.
  const fields = input.map(storableField);
  const records = await readFieldRecords();
  const existing = recordFor(records, elementId);

  if (fields.length === 0) {
    if (existing) {
      await removeFieldsDisplay(existing);
      await store.write(FIELDS_KEY, records.filter((record) => record.element !== elementId));
    }
    return;
  }

  const record = existing ?? { element: elementId, type, fields, card: null };
  record.type = type;
  record.fields = fields;
  if (!existing) records.push(record);

  await renderFields(record);
  await store.write(FIELDS_KEY, records);
}
