// The service locator: the single seam where use-cases obtain their ports.
//
// Each entry point (the headless board script, the panel) constructs a
// concrete adapter set once at startup and calls `configureServices`. Use-case
// modules read the ports through `services()`. The domain layer never touches
// this — only the use-case layer does — so porting to a standalone app is a
// matter of writing new adapters and calling `configureServices` with them.

import type { Canvas } from './ports/canvas';
import type { Notifier } from './ports/notifier';
import type { Planner } from './ports/planner';
import type { Runtime } from './ports/runtime';
import type { Store } from './ports/store';
import type { Viewport } from './ports/viewport';

export interface Services {
  canvas: Canvas;
  store: Store;
  notifier: Notifier;
  viewport: Viewport;
  runtime: Runtime;
  // Optional: only the panel page wires a Planner. The always-on board script
  // has no use for it, so it stays free of the AI adapter (and its bundle).
  planner?: Planner;
}

let current: Services | null = null;

export function configureServices(services: Services): void {
  current = services;
}

export function services(): Services {
  if (!current) {
    throw new Error('Services have not been configured — call configureServices() at startup.');
  }
  return current;
}
