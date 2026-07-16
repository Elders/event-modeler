// What the board was last seen to hold for an element's fields — the base a
// write is judged against.
//
// The panel editor writes the whole field list at once, from a copy it loaded
// earlier. That copy goes stale the moment someone types a `name : type` line
// onto the block itself, and writing it back then silently destroys what they
// typed: the block's text is the store, so an overwrite is a delete. The board
// is the source of truth (see sync.ts) — a stale panel does not get to overrule
// it just because it wrote last.
//
// So every write compares the board's current fields against the base recorded
// here, and abandons rather than clobbering when they disagree. Both directions
// record it: a read of the board notes what it found, and a successful write
// notes what it put there — the latter inside the edit queue's serialization, so
// a burst of panel edits compares against the previous edit rather than against
// the load it started from (which would read as a conflict with itself).
//
// Cached per page, like boxTags: no base means "no idea what the board held",
// which is not a conflict — it is a write that cannot be checked. The panel
// always loads before it can edit, so in practice there is always one.

import { asDisplayed, type Field } from '../../domain/fields';

const seen = new Map<string, Field[]>();

// Records the board's fields for an element: what a read found, or what a write
// just put there.
//
// Normalized through the display round-trip on the way in, so a base is always
// comparable to fields parsed off the board — whichever side it came from.
// Without it, a base taken from a write's input (or from a registry record,
// which is not display-shaped either) disagrees with the display it describes
// for anything rendering lossily, and the next write reads as a conflict with
// itself. asDisplayed is idempotent, so normalizing an already-parsed value is
// free.
export function noteBoardFields(elementId: string, fields: Field[]): void {
  seen.set(elementId, asDisplayed(fields));
}

// The fields the board was last seen to hold, or null if this page has never
// looked.
export function baseFields(elementId: string): Field[] | null {
  return seen.get(elementId) ?? null;
}
