// The safety net under the Diagnostics port: anything that reaches the page
// without having been reported on the way.
//
// Every failure is meant to be reported by the supervisor that catches it. This
// catches the ones that aren't — a bug in a path nobody guarded, or a `void
// somethingAsync()` whose rejection has no handler. Those are exactly the
// failures that were invisible before, so they must not be invisible now.
//
// Registration is guarded by a window flag, like the Runtime port's listeners:
// HMR re-evaluates modules and React StrictMode double-mounts, and stacked
// handlers would report every failure twice.

import type { Diagnostics } from '../../ports/diagnostics';

declare global {
  interface Window {
    __emErrorsRegistered?: boolean;
    __emErrorsSink?: Diagnostics;
  }
}

// Where the error came from, when the browser knows. It often doesn't — an error
// thrown from the devtools console carries no filename — and an absent field is
// left out rather than reported as null: the log is read by people, and a key
// with nothing behind it is noise in the export.
function originOf(event: ErrorEvent): Record<string, string | number> | undefined {
  const origin: Record<string, string | number> = {};
  if (event.filename) origin.source = event.filename;
  if (event.lineno) origin.line = event.lineno;
  return Object.keys(origin).length > 0 ? origin : undefined;
}

export function installGlobalErrorCapture(diagnostics: Diagnostics): void {
  // The indirection keeps the sink fresh across hot reloads without stacking
  // listeners (same idiom as MiroRuntime's handler slots).
  window.__emErrorsSink = diagnostics;
  if (window.__emErrorsRegistered) return;
  window.__emErrorsRegistered = true;

  window.addEventListener('error', (event) => {
    window.__emErrorsSink?.report(
      'error',
      'Uncaught error',
      event.error ?? event.message,
      originOf(event),
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.__emErrorsSink?.report('error', 'Unhandled promise rejection', event.reason);
  });
}
