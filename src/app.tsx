// Panel entry point: wires the Miro adapter set, registers the drop handler,
// and mounts the Panel. The background behaviors (spec housekeeping, on-canvas
// "+" buttons, reflow) are wired by the headless board script (src/index.ts),
// so they keep working while this panel is closed.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAnthropicPlanner } from './adapters/anthropic';
import { createMiroServices } from './adapters/miro';
import { registerDrop } from './features/registerDrop';
import { Panel } from './panel/Panel';
import { configureServices } from './services';
import './style.css';

// The panel page wires the Miro adapter set plus the Claude-backed Planner used
// by the "generate from text" feature. The board script (src/index.ts) omits
// the Planner — it has no use for it.
configureServices({ ...createMiroServices(), planner: createAnthropicPlanner() });
registerDrop();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );
}
