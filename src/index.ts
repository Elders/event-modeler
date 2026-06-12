// Runs on the board (loaded via index.html, the app's "App URL"). This page
// is alive for the whole board session — unlike the panel, which the user
// opens and closes — so everything that must keep working without the panel
// lives here: the spec housekeeping loop (copy sync, cleanup after deleted
// specs/slices, auto-reflow) and the on-board + button selection flow.
//
// The `miro` global is typed by @mirohq/websdk-types (see tsconfig.json).
import { specHousekeeping } from './features/specs/housekeeping';
import { handleSpecSelection } from './features/specs/selection';

type SelectionEvent = { items: { id: string; type: string }[] };

declare global {
  interface Window {
    __emHeadlessSelHandler?: (event: SelectionEvent) => void;
    __emHeadlessSelRegistered?: boolean;
    __emHeadlessSyncRegistered?: boolean;
  }
}

async function init(): Promise<void> {
  miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({ url: 'app.html' });
  });

  // Window-flag guards keep HMR module re-evaluation from stacking listeners;
  // the indirection keeps the active handler fresh across hot reloads.
  window.__emHeadlessSelHandler = (event) => void handleSpecSelection(event);
  if (!window.__emHeadlessSelRegistered) {
    window.__emHeadlessSelRegistered = true;
    miro.board.ui.on('selection:update', (event: SelectionEvent) =>
      window.__emHeadlessSelHandler?.(event),
    );
  }
  if (!window.__emHeadlessSyncRegistered) {
    window.__emHeadlessSyncRegistered = true;
    setInterval(() => void specHousekeeping(), 4000);
  }
}

init();
