// The browser adapter set: host capabilities that are the browser's, not Miro's.
// Kept apart from adapters/miro so a different canvas host can reuse them as-is
// — and so the rule that `miro` appears only under adapters/miro stays true.

import type { LogSource } from '../../domain/diagnostics';
import type { CreditMeter } from '../../ports/credits';
import type { Diagnostics } from '../../ports/diagnostics';
import { BrowserCreditMeter } from './credits';
import { BrowserDiagnostics } from './diagnostics';
import { installGlobalErrorCapture } from './globalErrors';

export { BrowserCreditMeter } from './credits';
export { BrowserDiagnostics } from './diagnostics';
export { installGlobalErrorCapture } from './globalErrors';

declare global {
  interface Window {
    __emDiagnostics?: Diagnostics;
    __emCredits?: CreditMeter;
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

// Builds the credit meter for one page. The board page is the stored figure's
// single writer, as with the log.
//
// Behind the same window flag, and it matters more here than it does for the
// log: HMR re-evaluates this module, and a second meter would not just open a
// second BroadcastChannel — it would take a second source id and start a second
// ring, so the same call would be counted once by each and the bar would read
// double. Reusing the instance also keeps the hour's spend across a hot reload,
// which is exactly when it is being watched.
export function createCreditMeter(source: LogSource): CreditMeter {
  if (!window.__emCredits) window.__emCredits = new BrowserCreditMeter(source === 'board');
  return window.__emCredits;
}
