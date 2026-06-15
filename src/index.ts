// Runs on the board (loaded via index.html, the app's "App URL"). This page is
// alive for the whole board session — unlike the panel, which the user opens
// and closes — so everything that must keep working without the panel lives
// here: the spec housekeeping loop (copy sync, cleanup after deleted
// specs/slices, auto-reflow) and the on-canvas "+" button selection flow.
//
// This entry only wires ports to use-cases. Swapping `createMiroServices` for
// another adapter set is all it takes to host the tool on a different canvas.

import { createMiroServices } from './adapters/miro';
import { handleSpecSelection } from './features/specs/selection';
import { specHousekeeping } from './features/specs/housekeeping';
import { configureServices, services } from './services';

declare global {
  interface Window {
    __emHousekeepingRegistered?: boolean;
  }
}

configureServices(createMiroServices());

const { runtime } = services();
runtime.onIconClick(() => void runtime.openPanel('app.html'));
runtime.onSelectionChange((items) => void handleSpecSelection(items));

// The housekeeping interval is guarded so HMR re-evaluation can't stack timers.
if (!window.__emHousekeepingRegistered) {
  window.__emHousekeepingRegistered = true;
  setInterval(() => void specHousekeeping(), 4000);
}
