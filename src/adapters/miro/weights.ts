// What each Web SDK call costs, in Miro credits. Miro's numbers, so they live in
// Miro's adapter.
//
// This is the table domain/pacing.ts states in prose, and the reason the
// background passes are paced by activity instead of a clock: the number of
// board.get calls per hour essentially *is* the cost. A completeness pass makes
// three of them and lands around 1,550 credits — the figure to check the bar
// against, since it was derived independently of anything here.
//
// The tiers (https://developers.miro.com/reference/rate-limiting#rate-limit-tiers):
//
//   Level 1 —    50 credits — 2000 calls/min
//   Level 2 —   100 credits — 1000 calls/min
//   Level 3 —   500 credits —  200 calls/min
//   Level 4 — 2000 credits —   50 calls/min
//
// Every element's page in the SDK reference prints the level under each method
// (https://developers.miro.com/docs/sdk-reference), so most of the entries below
// are quotations rather than guesses. The exceptions are flagged individually —
// an unflagged entry is documented, a flagged one is an inference the bar
// inherits.
//
// The gap is consistent and worth knowing: **the write methods print no level at
// all**. `sync`, `setMetadata` and `setAppData` show none on any item type, so
// the three of them are inferred. Level 1 is the reading their neighbours
// support (every documented create is Level 1, and every documented read of a
// single item is too), but see `syncImage` for where that reading is known to
// break.

export type MiroOp =
  // Level 3, documented. Ten call sites; the dominant cost of everything the
  // board script does unattended.
  | 'get'
  // Level 3, documented. Note this is the *call*: the selection:update event
  // that usually precedes it is a push and free, which is why the pacing leans
  // on the event and never on this.
  | 'getSelection'
  // Level 3, documented on the Frame page — bulk retrieval, priced like `get`.
  | 'getChildren'
  // Level 3, documented: "create or update an image or an embed item".
  | 'createImage'
  // Level 3 by the same sentence — "or *update*". Updating an image costs the
  // same 500 as creating one, ten times any other sync.
  //
  // This matters more than a lone op suggests: screens and automations ARE
  // images (grouped title-text + image pairs), so a spec reflow or a slice
  // re-dock that nudges a handful of them costs 500 apiece, not 50. Charging
  // every sync at Level 1 under-counted exactly the passes that run unattended.
  //
  // INFERRED in one respect: `image.sync()` prints no level of its own, like
  // every other write method. This prices it from the tier description instead,
  // which is the only place the docs say what "update an image" costs.
  | 'syncImage'
  // Level 1, documented: createStickyNote, createText, createFrame, createShape,
  // createConnector and createCard all print Level 1. Only images are dearer.
  | 'create'
  // Level 1 — MEASURED, not documented. `sync` prints no level anywhere, which
  // invites the reading that an undocumented method simply isn't rate limited.
  // It is: bursting it against a real board drew a 429 after ~1,975 calls, and
  // 100,000 credits/min / 1,975 = ~50.6 per call. Level 1, within the noise.
  //
  // Which settles the principle for the inferences below too — silence in the
  // docs is an omission, not an exemption. Not worth re-deriving from the docs;
  // they will still be silent.
  | 'sync'
  // getMetadata is documented Level 1. setMetadata prints no level and is
  // INFERRED to match it.
  | 'meta'
  // getAppData is documented Level 1. setAppData prints no level and is
  // INFERRED to match it.
  | 'appData'
  // Level 1, documented: board.group, group.ungroup, board.remove,
  // board.deselect and board.getInfo each print Level 1.
  //
  // One INFERENCE rides along here: `frame.add()` prints no level, and is
  // assumed Level 1 with the rest.
  | 'structural';

const LEVEL_1 = 50;
const LEVEL_3 = 500;

export const WEIGHT: Record<MiroOp, number> = {
  get: LEVEL_3,
  getSelection: LEVEL_3,
  getChildren: LEVEL_3,
  createImage: LEVEL_3,
  syncImage: LEVEL_3,
  create: LEVEL_1,
  sync: LEVEL_1,
  meta: LEVEL_1,
  appData: LEVEL_1,
  structural: LEVEL_1,
};
