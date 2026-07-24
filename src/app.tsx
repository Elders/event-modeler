// Panel entry point: wires the Miro adapter set, registers the drop handler,
// and mounts the Panel. The background behaviors (spec housekeeping, on-canvas
// "+" buttons, reflow) are wired by the headless board script (src/index.ts),
// so they keep working while this panel is closed.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAnthropicPlanner } from './adapters/anthropic';
import { createCreditMeter, createDiagnostics } from './adapters/browser';
import { createFigmaDesignSource } from './adapters/figma';
import { createMiroServices } from './adapters/miro';
import { createPdfReader } from './adapters/pdf';
import { registerDrop } from './features/registerDrop';
import { Panel } from './panel/Panel';
import { configureServices } from './services';
import './style.css';

// The panel page wires the Miro adapter set plus the Claude-backed Planner used
// by the "generate from text" feature. The board script (src/index.ts) omits
// the Planner — it has no use for it. Diagnostics and the credit meter are wired
// by both, tagged with which page it is; this one also renders them both, in the
// Console tab.
//
// The panel counts its own spend (generation bursts through here) but is not the
// meter's writer to storage — the board page is, being the one alive for the
// whole session.
const credits = createCreditMeter('panel');
configureServices({
  ...createMiroServices(credits),
  diagnostics: createDiagnostics('panel'),
  credits,
  planner: createAnthropicPlanner(),
  designSource: createFigmaDesignSource(),
  pdfReader: createPdfReader(),
});
registerDrop();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );
}
