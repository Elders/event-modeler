// When the background passes should run. Pure — no platform, no clock of its
// own — so the policy can be reasoned about and tested directly.
//
// The passes exist because the host fires no item-update, delete or resize
// events, so polling is the only way to notice a change. But polling costs the
// same whether or not anything changed, and Miro charges by the call against a
// budget measured *per hour*:
//
//   miro.board.get        500 credits  (Weight Level 3 — as costly as creating
//                                       an image; the docs' own exception to
//                                       "most calls are 50")
//   item.getMetadata       50 credits
//   board.get/setAppData   50 credits
//   budget          1,000,000 credits per hour  (~16,700/minute averaged)
//
// A completeness pass makes three board.get calls plus change — ~1,550 credits.
// The fixed 4s poll this replaces was therefore ~1.4M credits/hour on a board
// nobody was touching: over budget by itself, on an empty board, before anyone
// did any work (see DECISIONS.md).
//
// So passes are driven by activity rather than by a clock. Selection changes are
// a free push event — the one signal that a human did something which costs
// nothing to receive — and a pass runs once they settle. The interval below is
// only a safety net for changes made with no local activity at all (a REST/bot
// edit, or a client whose script died); the person who makes a change has an
// active page of their own, and the results are board state everyone else sees.
//
// The same policy paces the panel's Fields watch, which re-reads the board for
// text typed onto a block directly. Its free signal is the panel regaining focus
// rather than a selection change — board edits happen while the panel is blurred
// — but the shape is identical: settle after activity, and an idle fallback for
// a change nothing local can have noticed.

// Quiet time after the last activity before a pass runs. Long enough that a drag
// (which fires a selection event per tick) collapses into a single pass at the
// end, short enough that it feels immediate when you finish an edit.
export const SETTLE_MS = 2_000;

// The safety net: the longest a change made with NO local activity anywhere can
// go unnoticed. Every human-driven path is covered by the settle above, in ~2s.
export const IDLE_FALLBACK_MS = 120_000;

// How often to *check* whether the safety net is due. A local timer costing no
// API calls, so it can tick freely; only the pass itself is expensive.
export const FALLBACK_CHECK_MS = 15_000;

// The cleanup/reflow/copy-sync passes cost more than a completeness pass and only
// repair damage from edits, so they run at most this often even while someone is
// working. The fast selection watcher already handles the interactive cases.
export const HEAVY_MIN_GAP_MS = 30_000;

export function heavyPassesDue(now: number, lastRun: number): boolean {
  return now - lastRun >= HEAVY_MIN_GAP_MS;
}

export function fallbackDue(now: number, lastRun: number): boolean {
  return now - lastRun >= IDLE_FALLBACK_MS;
}
