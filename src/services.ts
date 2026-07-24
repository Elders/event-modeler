// The service locator: the single seam where use-cases obtain their ports.
//
// Each entry point (the headless board script, the panel) constructs a
// concrete adapter set once at startup and calls `configureServices`. Use-case
// modules read the ports through `services()`. The domain layer never touches
// this — only the use-case layer does — so porting to a standalone app is a
// matter of writing new adapters and calling `configureServices` with them.

import type { Canvas } from './ports/canvas';
import type { CreditMeter } from './ports/credits';
import type { DesignSource } from './ports/designSource';
import type { Diagnostics } from './ports/diagnostics';
import type { Notifier } from './ports/notifier';
import type { PdfReader } from './ports/pdfReader';
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
  // Where a supervisor sends the failure it caught. Both pages wire one; each
  // tags its entries with which page it is, since they are separate iframes.
  diagnostics: Diagnostics;
  // How much of the host's API budget this app has spent. Both pages wire one —
  // they spend a single budget between them and each has to count its own share
  // — and unlike the planner it is not optional: the board script does most of
  // the spending, so a meter it didn't feed would report almost nothing.
  credits: CreditMeter;
  // Optional: only the panel page wires a Planner. The always-on board script
  // has no use for it, so it stays free of the AI adapter (and its bundle).
  planner?: Planner;
  // Optional, panel-only for the same reason: the Figma import (draft a model
  // from a design file). The board script omits it and stays free of the Figma
  // adapter.
  designSource?: DesignSource;
  // Optional, panel-only: the PDF/vision import (draft a model from exported
  // design pages). Board script omits it — pdf.js never enters its bundle.
  pdfReader?: PdfReader;
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
