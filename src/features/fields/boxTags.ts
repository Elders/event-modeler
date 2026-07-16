// Which shapes are fields boxes — remembered, because asking is expensive.
//
// Only a shape carrying the `fields-box` metadata tag is ever treated as one (a
// user-drawn shape grouped with the same screen must never be hijacked), and the
// only way to ask is one metadata read per shape. The completeness check asks
// about every shape grouped with a connected screen, on every pass — so the cost
// of that check grew with the size of the model while its cadence stayed fixed,
// which is precisely what walked the board into its hourly credit budget as the
// model got bigger (see DECISIONS.md).
//
// The answer is worth remembering because it effectively never changes: a box is
// tagged when it is created and stays tagged, and a user's own shape never
// becomes one. The single exception is housekeeping's migration, which stamps the
// tag onto boxes that predate it — that path calls `rememberFieldsBox` so the
// cached "no" can't outlive the truth.
//
// Cached per page, so it costs nothing to be wrong for long: a reload re-asks.

import { services } from '../../services';

const tagged = new Map<string, boolean>();

// Whether this shape carries the fields-box tag, asking the board only the first
// time. A read failure propagates and is NOT cached — an unanswered question has
// no answer to remember, and caching the silence would turn one rate-limited
// moment into a screen that permanently has no fields.
export async function isFieldsBox(shapeId: string): Promise<boolean> {
  const known = tagged.get(shapeId);
  if (known !== undefined) return known;
  const meta = await services().canvas.getMeta(shapeId);
  const answer = meta?.type === 'fields-box';
  tagged.set(shapeId, answer);
  return answer;
}

// Records that a shape is now tagged, without a read. Called after stamping the
// tag, so a "no" cached before the stamp is corrected rather than believed.
export function rememberFieldsBox(shapeId: string): void {
  tagged.set(shapeId, true);
}

// Drops what we know about a shape — used when it's removed, so its id can't sit
// in the map for the life of the page.
export function forgetFieldsBox(shapeId: string): void {
  tagged.delete(shapeId);
}
