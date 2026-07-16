// The create/edit/remove use-case behind the panel editor: render an element's
// field definitions onto the board, and — for box-mode blocks only — track them
// in the registry. Stickies carry their fields in their own text and keep no
// record; screens/automations keep one so their separate box shape can be rebuilt.
//
// Calls are serialized through a promise chain: the editor persists on every
// keystroke-blur and type change, and each call does a read-modify-write of the
// shared registry — running them one at a time keeps last-write-wins correct
// and avoids a lost update from two overlapping writes.
//
// Serializing only orders *our own* writes, though. The block's text is equally
// editable on the board, so every write also checks that the board still holds
// what the panel thinks it does before overwriting it, and abandons if not (see
// base.ts). The check is free: the display has to be read anyway — for the
// sticky's name, or to find the box to update.

import { parseBoxFields, parseStickyFields, sameFields, type Field } from '../../domain/fields';
import { services } from '../../services';
import { baseFields, noteBoardFields } from './base';
import { findFieldsBox } from './board';
import { displayMode, readFieldRecords, recordFor, writeFieldRecords } from './model';
import { removeFieldsDisplay, renderFields } from './render';
import type { BlockType } from '../../domain/vocabulary';

// Whether the write landed. `applied: false` is not a failure — it is the board
// having moved on: `board` is what it actually holds now, for the caller to show
// instead of the edit it asked for.
export type SaveOutcome = { applied: true } | { applied: false; board: Field[] };

let queue: Promise<unknown> = Promise.resolve();

export function setFields(
  elementId: string,
  type: BlockType,
  fields: Field[],
): Promise<SaveOutcome> {
  const run = () => doSetFields(elementId, type, fields);
  // Chain on both fulfilment and rejection so one failure can't stall the queue.
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}

// The board's fields for this element differ from the base this page recorded —
// someone edited the block directly since the panel last looked. Says so and
// hands back what the board holds, rather than overwriting it.
async function conflict(board: Field[]): Promise<SaveOutcome> {
  await services().notifier.info(
    "This block's fields changed on the board, so your edit wasn't applied — showing what the board has now.",
  );
  return { applied: false, board };
}

function diverged(elementId: string, board: Field[]): boolean {
  const base = baseFields(elementId);
  // No base means this page has never seen the board's fields, so there is
  // nothing to have diverged from — an unchecked write, not a conflicting one.
  return base !== null && !sameFields(board, base);
}

async function doSetFields(elementId: string, type: BlockType, input: Field[]): Promise<SaveOutcome> {
  const { canvas } = services();
  const records = await readFieldRecords();
  const existing = recordFor(records, elementId);
  const others = records.filter((record) => record.element !== elementId);

  // Text mode (stickies): the fields render into the sticky's own text, which is
  // their only store — render it (an empty list clears the lines) and keep no
  // record. Drop any leftover record from older data or a box→text type change.
  if (displayMode(type) === 'text') {
    const [element] = await canvas.get([elementId]);
    // Gone from the board: nothing to write onto, and nothing to clobber.
    if (!element) return { applied: true };
    const shown = parseStickyFields(element.content);
    if (diverged(elementId, shown)) return conflict(shown);
    // Hand the element on so renderFields doesn't re-read what we just fetched.
    await renderFields({ element: elementId, type, fields: input, card: null }, element);
    noteBoardFields(elementId, input);
    if (existing) await writeFieldRecords(others);
    return { applied: true };
  }

  // Box mode (screens/automations): keep a record so the attached box — a
  // separate shape a frame-shrink can evict or delete — can be rebuilt. The box
  // is looked up rather than trusted from the record: it is what the user edits,
  // so it is what a conflict is judged against, and pointing the record at the
  // box already on the board keeps renderFields from creating a second one.
  const box = await findFieldsBox(elementId, existing?.card ?? null);
  // Only a box that's actually there can have been edited behind the panel's
  // back. With none, there is no display to have diverged from — the registry
  // record is not one, it's the memory used to rebuild it below.
  if (box) {
    const shown = parseBoxFields(box.content, existing?.fields ?? []);
    if (diverged(elementId, shown)) return conflict(shown);
  }

  if (input.length === 0) {
    if (existing) {
      await removeFieldsDisplay(existing);
      await writeFieldRecords(others);
    }
    noteBoardFields(elementId, input);
    return { applied: true };
  }
  const record = existing ?? { element: elementId, type, fields: input, card: null };
  record.type = type;
  record.fields = input;
  record.card = box?.id ?? null;
  await renderFields(record);
  await writeFieldRecords([...others, record]);
  noteBoardFields(elementId, input);
  return { applied: true };
}
