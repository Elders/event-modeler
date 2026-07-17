// Runs on the board (loaded via index.html, the app's "App URL"). This page is
// alive for the whole board session — unlike the panel, which the user opens
// and closes — so everything that must keep working without the panel lives
// here: the spec housekeeping loop (copy sync, cleanup after deleted
// specs/slices, auto-reflow) and the on-canvas "+" button selection flow.
//
// Being alive for the whole session is also what makes this page expensive. Its
// polling is paid for whether or not anything changed, against an API credit
// budget measured *per hour* — so the cadence follows the one free signal we
// have for whether a human is working (selection:update, a push event). See
// domain/pacing.
//
// This entry only wires ports to use-cases. Swapping `createMiroServices` for
// another adapter set is all it takes to host the tool on a different canvas.

import { createCreditMeter, createDiagnostics } from './adapters/browser';
import { createMiroServices } from './adapters/miro';
import { isBoardRateLimited } from './features/hostStatus';
import {
  FALLBACK_CHECK_MS,
  SETTLE_MS,
  fallbackDue,
  heavyPassesDue,
} from './domain/pacing';
import { completenessHousekeeping } from './features/completeness';
import { compactFieldRegistry } from './features/fields/model';
import { fieldsHousekeeping } from './features/fields/housekeeping';
import { clearStaleCheckpoint } from './features/generateCheckpoint';
import { handleSpecSelection } from './features/specs/selection';
import { specHousekeeping } from './features/specs/housekeeping';
import { configureServices, services } from './services';

// A generation checkpoint not resumed within a day is abandoned — drop it so its
// plan can't sit in the board's app-data budget indefinitely (a reload within the
// day can still resume).
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;

declare global {
  interface Window {
    __emHousekeepingRegistered?: boolean;
    __emBoardSelRegistered?: boolean;
  }
}

// This page's failures are the ones nobody could see: it has no UI, and its
// housekeeping loops run with the panel closed. Its entries carry the 'board'
// tag and reach the panel's Console tab over the diagnostics channel.
//
// The credit meter is the same story told in numbers. This page does nearly all
// of the spending — the passes below run whether or not anyone is watching — so
// its ring is the one that matters, and it reaches the Console over a channel of
// its own. It is also the meter's single writer to storage, which is what lets
// the hour's spend survive the board refresh that usually follows things going
// wrong.
const credits = createCreditMeter('board');
configureServices({
  ...createMiroServices(credits),
  diagnostics: createDiagnostics('board'),
  credits,
});

const { runtime } = services();
runtime.onIconClick(() => void runtime.openPanel('app.html'));

// Guarded because onSelectionChange now *adds* a subscriber rather than
// replacing a single handler: this page subscribes at module scope and never
// unsubscribes, so an HMR re-evaluation would stack a second one and run the
// whole selection flow twice. (Changes to this file force a full board reload
// anyway — see CLAUDE.md — so the handler being frozen across HMR costs nothing.)
//
// The .catch is the supervisor: the SDK gives us no way to fail a handler, so a
// rejection here would be an unhandled one. Report and let the next selection try.
if (!window.__emBoardSelRegistered) {
  window.__emBoardSelRegistered = true;
  runtime.onSelectionChange((items) => {
    // A selection change is the one signal that someone is working which costs
    // nothing to receive — it's a push event, not an API call. It is what
    // schedules the background passes, so note it before doing anything else.
    noteActivity();
    void handleSpecSelection(items).catch((error) =>
      services().diagnostics.report('warn', 'Selection handling failed', error),
    );
  });
}

// Supervisor for the one-shot startup passes. Their reads can fail (a rate
// limited board answers nothing), and neither is worth blocking startup for —
// but "it didn't run" has to be said, not inferred later from the mess.
const atStartup = (what: string, pass: () => Promise<void>) =>
  void pass().catch((error) => services().diagnostics.report('warn', `${what} failed`, error));

let settleTimer: number | null = null;
let lastPass = 0;
let lastHeavyPass = 0;

// The completeness check on its own. Each pass has its own supervisor, so it
// can't throw here. `lastPass` is stamped even if the pass fails — a board that
// won't answer shouldn't be asked again 15 seconds later.
async function runCompleteness(): Promise<void> {
  if (isBoardRateLimited()) return;
  lastPass = Date.now();
  await completenessHousekeeping();
}

// Everything, after activity settles.
async function runPasses(): Promise<void> {
  await runCompleteness();
  // The cleanup/reflow/copy-sync passes cost more and are only a fallback (the
  // fast selection watcher handles the interactive cases), so they don't run on
  // every settle — every edit would otherwise re-read every frame on the board.
  if (isBoardRateLimited() || !heavyPassesDue(Date.now(), lastHeavyPass)) return;
  lastHeavyPass = Date.now();
  await specHousekeeping();
  await fieldsHousekeeping();
}

// Someone did something. Debounced: the timer restarts on every activity, so a
// drag — which fires a selection event per tick — collapses into one pass once
// it stops, instead of one pass per tick for as long as it lasts.
function noteActivity(): void {
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => {
    settleTimer = null;
    void runPasses();
  }, SETTLE_MS);
}

// The housekeeping interval is guarded so HMR re-evaluation can't stack timers.
if (!window.__emHousekeepingRegistered) {
  window.__emHousekeepingRegistered = true;
  atStartup('Clearing the stale generation checkpoint', () =>
    clearStaleCheckpoint(CHECKPOINT_TTL_MS),
  );
  atStartup('Compacting the field registry', () => compactFieldRegistry());

  // A board just loaded is a board someone is about to work on, and possibly one
  // a previous session left half-repaired — so treat the load itself as activity
  // and let the passes run once.
  noteActivity();

  // The safety net, and only that: a change made with no local activity anywhere
  // (a REST/bot edit, a client whose script died) would otherwise never be
  // noticed. Everything a human does is covered by the settle above, in ~2s. The
  // timer itself is free; only the pass it guards costs anything, and it fires
  // just once per IDLE_FALLBACK_MS.
  //
  // Completeness only — deliberately not the heavy passes. Those repair damage
  // from edits, and an idle board has had none: whoever edits has an active page
  // that already ran them, and their repairs are board state everyone else sees.
  // Dragging them along here would double the idle cost for nothing.
  setInterval(() => {
    if (isBoardRateLimited() || !fallbackDue(Date.now(), lastPass)) return;
    void runCompleteness();
  }, FALLBACK_CHECK_MS);
}
