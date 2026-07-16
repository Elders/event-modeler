// The browser adapter set: host capabilities that are the browser's, not Miro's.
// Kept apart from adapters/miro so a different canvas host can reuse them as-is
// — and so the rule that `miro` appears only under adapters/miro stays true.

import type { LogSource } from '../../domain/diagnostics';
import type { Diagnostics } from '../../ports/diagnostics';
import { BrowserDiagnostics } from './diagnostics';
import { installGlobalErrorCapture } from './globalErrors';

export { BrowserDiagnostics } from './diagnostics';
export { installGlobalErrorCapture } from './globalErrors';

declare global {
  interface Window {
    __emDiagnostics?: Diagnostics;
  }
}

// Builds the log for one page and arms the uncaught-error net over it. The board
// page is the log's single writer when persistence is on (see diagnostics.ts).
//
// One instance per page, behind a window flag: HMR re-evaluates this module, and
// a second instance would open a second BroadcastChannel while the first stayed
// subscribed (same reason the Runtime port guards its listeners). Reusing it also
// keeps the log itself across a hot reload, which is when it's being read.
export function createDiagnostics(source: LogSource): Diagnostics {
  if (!window.__emDiagnostics) {
    window.__emDiagnostics = new BrowserDiagnostics(source, source === 'board');
  }
  installGlobalErrorCapture(window.__emDiagnostics);
  return window.__emDiagnostics;
}
