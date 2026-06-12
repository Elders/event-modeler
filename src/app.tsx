// Panel entry point: mounts the Panel component and registers the drop
// handler. The background behaviors (spec housekeeping, on-board + buttons,
// reflow) are registered by the headless board script (src/index.ts), so
// they keep working while this panel is closed.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from './panel/Panel';
import { registerDropHandler } from './panel/registerDropHandler';
import './style.css';

registerDropHandler();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );
}
