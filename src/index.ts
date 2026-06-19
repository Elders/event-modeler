// Runs on the board (loaded via index.html, the app's "App URL"). This page is
// alive for the whole board session — unlike the panel, which the user opens
// and closes — so everything that must keep working without the panel lives
// here: the spec housekeeping loop (copy sync, cleanup after deleted
// specs/slices, auto-reflow) and the on-canvas "+" button selection flow.
//
// This entry only wires ports to use-cases. Swapping `createMiroServices` for
// another adapter set is all it takes to host the tool on a different canvas.

import { createMiroServices } from './adapters/miro';
import { isUnderRateLimit } from './adapters/miro/rateLimit';
import { completenessHousekeeping } from './features/completeness';
import { compactFieldRegistry } from './features/fields/model';
import { fieldsHousekeeping } from './features/fields/housekeeping';
import { clearStaleCheckpoint } from './features/generateCheckpoint';
import { handleSpecSelection } from './features/specs/selection';
import { specHousekeeping } from './features/specs/housekeeping';
import { configureServices, services } from './services';

// A generation checkpoint not resumed within a day is abandoned — drop it so its
// plan can't sit in the board's app-data budget indefinitely (a reload within the
// day can still resume).
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;

declare global {
  interface Window {
    __emHousekeepingRegistered?: boolean;
  }
}

configureServices(createMiroServices());

const { runtime } = services();
runtime.onIconClick(() => void runtime.openPanel('app.html'));
runtime.onSelectionChange(
  (items) =>
    void handleSpecSelection(items).catch((error) =>
      console.warn('Selection handling failed', error),
    ),
);

// The housekeeping interval is guarded so HMR re-evaluation can't stack timers.
if (!window.__emHousekeepingRegistered) {
  window.__emHousekeepingRegistered = true;
  void clearStaleCheckpoint(CHECKPOINT_TTL_MS);
  void compactFieldRegistry();
  // Completeness polls fast so arrows track field edits promptly. It's light
  // (a few reads) and its writes are idempotent and bounded — an arrow is
  // reddened/restored only when its color actually needs to change — so it can't
  // spiral and is safe to keep running even under rate-limit pressure.
  setInterval(() => void completenessHousekeeping(), 4000);
  // The heavier cleanup/reflow/sync passes run at a slower cadence and stand down
  // while the limiter is backing off: they're background fallbacks (the fast
  // selection watcher handles the interactive cases), so they don't need a tight
  // loop and shouldn't pile writes onto a saturated board.
  setInterval(() => {
    if (isUnderRateLimit()) return;
    void specHousekeeping();
    void fieldsHousekeeping();
  }, 8000);
}
