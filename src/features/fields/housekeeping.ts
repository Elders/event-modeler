// The periodic background pass for fields, run from the headless board script:
// cleans up after deleted elements, adopts manual edits of an attached box's
// text into the registry, recreates boxes that were deleted or evicted, and
// re-docks boxes that drifted. Polling is the only option — there are no
// item-update or item-delete events.

import { parseBoxFields, sameFields } from '../../domain/fields';
import { type FieldRecord } from '../../domain/records';
import type { CanvasElement } from '../../ports/canvas';
import { services } from '../../services';
import { absoluteCenterIn, localCenterIn } from '../helpers';
import { isFieldsBox, rememberFieldsBox } from './boxTags';
import { displayMode, readFieldRecords, writeFieldRecords } from './model';
import { boxLayout, removeFieldsDisplay, renderFields } from './render';

let running = false;

export async function fieldsHousekeeping(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await doFieldsHousekeeping();
  } catch (error) {
    // A retry-exhausted rate-limit (or any failure) must not surface as an
    // unhandled rejection; the next tick retries from a clean state. Abandoning
    // the tick is the whole response — so it has to be said out loud, or a board
    // that never heals looks like one that has nothing to heal.
    services().diagnostics.report('warn', 'Fields housekeeping failed', error);
  } finally {
    running = false;
  }
}

async function doFieldsHousekeeping(): Promise<void> {
  const { canvas } = services();
  const records = await readFieldRecords();
  if (records.length === 0) return;

  // One batched fetch of every element and existing box the registry references.
  const ids = new Set<string>();
  for (const record of records) {
    ids.add(record.element);
    if (record.card) ids.add(record.card);
  }
  const live = new Map((await canvas.get([...ids])).map((el) => [el.id, el] as const));

  // Parent frames of every live element and box, fetched once. The box re-dock
  // reasons in absolute space: a screen and its box can each sit in a slice (or
  // one in, one out), so each reports coords relative to its own parent, and
  // element.x/element.y can't be compared to box.x/box.y directly.
  const parentIds = new Set<string>();
  for (const el of live.values()) if (el.parentId) parentIds.add(el.parentId);
  const frames = new Map(
    (parentIds.size > 0 ? await canvas.get([...parentIds]) : []).map((f) => [f.id, f] as const),
  );
  const parentOf = (el: CanvasElement): CanvasElement | null =>
    el.parentId ? (frames.get(el.parentId) ?? null) : null;

  const survivors: FieldRecord[] = [];
  let dirty = false;
  for (const record of records) {
    const element = live.get(record.element);
    if (!element) {
      // The element was deleted — drop its box (box mode) and prune the record.
      await removeFieldsDisplay(record);
      dirty = true;
      continue;
    }
    // Text-mode fields live in the sticky's own text and are user-authoritative;
    // there is nothing here to heal.
    if (displayMode(record.type) === 'text') {
      survivors.push(record);
      continue;
    }

    const box = record.card ? live.get(record.card) : undefined;
    if (box && box.kind === 'shape') {
      // The box's text is user-authoritative, like a sticky's: a manual edit on
      // the board is adopted into the registry, never overwritten — including
      // an emptied box, which clears the fields just as it would on a sticky.
      const parsed = parseBoxFields(box.content, record.fields);
      if (parsed.length === 0) {
        // Emptied by hand: an empty box has nothing left to show, so evict it
        // and drop the record — the same end state as clearing the fields from
        // the panel.
        await removeFieldsDisplay(record);
        dirty = true;
        continue;
      }
      survivors.push(record);
      // Registry boxes are app-written, so one that predates tagging is stamped
      // on sight — this migration is what lets the tag-gated lookups (recovery
      // scan, completeness) recognize boxes created before the tag existed. The
      // lookup is cached, so tell the cache: a "no" it recorded before this
      // stamp would otherwise outlive the truth for the life of the page.
      if (!(await isFieldsBox(box.id))) {
        await canvas.setMeta(box.id, { type: 'fields-box' });
        rememberFieldsBox(box.id);
      }
      if (!sameFields(parsed, record.fields)) {
        record.fields = parsed;
        dirty = true;
      }
      // Fit and re-dock: size the box to the lines it actually shows (a manual
      // edit changes the line count but Miro never resizes the shape) and keep
      // it centered under the element. Size and position only — the content is
      // never rewritten here, so an edit in progress can't be clobbered; the
      // text normalizes on the next panel save. Compared and written in absolute
      // space (via each element's parent frame), then converted back into the
      // box's own space, so a box captured by a slice isn't dragged off.
      const center = absoluteCenterIn(element, parentOf(element));
      const { x: targetX, y: targetY, height } = boxLayout(element, center, parsed.length);
      const boxCenter = absoluteCenterIn(box, parentOf(box));
      if (
        Math.abs(box.height - height) > 1 ||
        Math.abs(boxCenter.x - targetX) > 1 ||
        Math.abs(boxCenter.y - targetY) > 1
      ) {
        const local = localCenterIn(targetX, targetY, parentOf(box));
        await canvas.apply([{ id: box.id, x: local.x, y: local.y, height }]);
      }
    } else if (record.fields.length === 0) {
      // The box is gone and the record holds no fields — rebuilding would
      // resurrect an empty box the user just deleted, so prune the record.
      dirty = true;
    } else {
      survivors.push(record);
      // The box was deleted or evicted (e.g. by a frame shrink) — rebuild it
      // from the record; renderFields points record.card at the new box.
      const before = record.card;
      await renderFields(record, element);
      if (record.card !== before) dirty = true;
    }
  }

  if (dirty) await writeFieldRecords(survivors);
}
