// Assembles the Miro adapter set into a Services bundle. Each entry point calls
// this once at startup and hands the result to configureServices(). To run the
// tool on a different canvas, write an equivalent factory for that platform.

import type { Services } from '../../services';
import { MiroCanvas } from './canvas';
import { MiroNotifier } from './notifier';
import { MiroRuntime } from './runtime';
import { MiroStore } from './store';
import { MiroViewport } from './viewport';

export function createMiroServices(): Services {
  return {
    canvas: new MiroCanvas(),
    store: new MiroStore(),
    notifier: new MiroNotifier(),
    viewport: new MiroViewport(),
    runtime: new MiroRuntime(),
  };
}
