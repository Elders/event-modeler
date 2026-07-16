// Assembles the Miro adapter set. Each entry point calls this once at startup,
// adds the host capabilities that aren't Miro's (the diagnostics log, and the
// planner on the panel), and hands the result to configureServices(). To run the
// tool on a different canvas, write an equivalent factory for that platform.

import type { Services } from '../../services';
import { MiroCanvas } from './canvas';
import { MiroNotifier } from './notifier';
import { MiroRuntime } from './runtime';
import { MiroStore } from './store';
import { MiroViewport } from './viewport';

// Everything Miro supplies. Diagnostics is the caller's to add: it belongs to
// the browser, not the canvas, and its source tag differs per page.
export function createMiroServices(): Omit<Services, 'diagnostics'> {
  return {
    canvas: new MiroCanvas(),
    store: new MiroStore(),
    notifier: new MiroNotifier(),
    viewport: new MiroViewport(),
    runtime: new MiroRuntime(),
  };
}
