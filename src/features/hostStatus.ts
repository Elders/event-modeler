// Whether the board is currently asking to be left alone.
//
// The board refuses work when its API credit budget runs out, and the hourly
// budget does not refill in seconds — so a loop that keeps asking is spending a
// budget that is already gone and making the outage longer. Every background
// loop checks this and stands down; the adapter's cooldown lapses on its own and
// the next tick probes.
//
// Work the user actually asked for is NOT gated on this: it pushes through and
// fails with a real message, which is the honest answer to a click. Only the
// unattended loops — the ones spending credits nobody asked them to spend —
// stand down.
//
// This exists so the panel can ask without reaching past the use-case layer for
// a port (the board script is a composition root and reads `canvas` directly).

import { services } from '../services';

export function isBoardRateLimited(): boolean {
  return services().canvas.isUnderRateLimit();
}
