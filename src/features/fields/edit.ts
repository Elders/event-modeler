// The create/edit/remove use-case behind the panel editor: render an element's
// field definitions onto the board, and — for box-mode blocks only — track them
// in the registry. Stickies carry their fields in their own text and keep no
// record; screens/automations keep one so their separate box shape can be rebuilt.
//
// Calls are serialized through a promise chain: the editor persists on every
// keystroke-blur and type change, and each call does a read-modify-write of the
// shared registry — running them one at a time keeps last-write-wins correct
// and avoids a lost update from two overlapping writes.

import { displayMode, readFieldRecords, recordFor, writeFieldRecords, type Field } from './model';
import { removeFieldsDisplay, renderFields } from './render';
import type { BlockType } from '../../domain/vocabulary';

let queue: Promise<unknown> = Promise.resolve();

export function setFields(elementId: string, type: BlockType, fields: Field[]): Promise<void> {
  const run = () => doSetFields(elementId, type, fields);
  // Chain on both fulfilment and rejection so one failure can't stall the queue.
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

async function doSetFields(elementId: string, type: BlockType, input: Field[]): Promise<void> {
  const records = await readFieldRecords();
  const existing = recordFor(records, elementId);
  const others = records.filter((record) => record.element !== elementId);

  // Text mode (stickies): the fields render into the sticky's own text, which is
  // their only store — render it (an empty list clears the lines) and keep no
  // record. Drop any leftover record from older data or a box→text type change.
  if (displayMode(type) === 'text') {
    await renderFields({ element: elementId, type, fields: input, card: null });
    if (existing) await writeFieldRecords(others);
    return;
  }

  // Box mode (screens/automations): keep a record so the attached box — a
  // separate shape a frame-shrink can evict or delete — can be rebuilt.
  if (input.length === 0) {
    if (existing) {
      await removeFieldsDisplay(existing);
      await writeFieldRecords(others);
    }
    return;
  }
  const record = existing ?? { element: elementId, type, fields: input, card: null };
  record.type = type;
  record.fields = input;
  await renderFields(record);
  await writeFieldRecords([...others, record]);
}
