// Assembles the Miro adapter set. Each entry point calls this once at startup,
// adds the host capabilities that aren't Miro's (the diagnostics log, and the
// planner on the panel), and hands the result to configureServices(). To run the
// tool on a different canvas, write an equivalent factory for that platform.

import type { CreditMeter } from '../../ports/credits';
import type { Services } from '../../services';
import { MiroCanvas } from './canvas';
import { MiroNotifier } from './notifier';
import { setCreditMeter } from './rateLimit';
import { MiroRuntime } from './runtime';
import { MiroStore } from './store';
import { MiroViewport } from './viewport';

// Everything Miro supplies. Diagnostics and the credit meter are the caller's to
// add: they belong to the browser, not the canvas, and both are tagged per page.
//
// The meter is handed in rather than built here because the two halves of it
// belong in different places. Counting and sharing the figure is the browser's
// job, but only this adapter knows what a call *costs* — so the meter arrives
// built, and this points the rate limiter (the one gate every SDK call passes
// through) at it. That indirection is also why the meter must be wired before
// any use-case runs: a call made earlier would go uncounted.
export function createMiroServices(credits: CreditMeter): Omit<Services, 'diagnostics' | 'credits'> {
  setCreditMeter(credits);
  return {
    canvas: new MiroCanvas(),
    store: new MiroStore(),
    notifier: new MiroNotifier(),
    viewport: new MiroViewport(),
    runtime: new MiroRuntime(),
  };
}
