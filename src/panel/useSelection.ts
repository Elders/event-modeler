// Tracks the board's current selection inside the panel. The panel page is a
// separate window from the headless board script, so subscribing here does not
// disturb the board's own selection flow; MiroRuntime guards the SDK
// registration per page (HMR/StrictMode safe) and hands back an unsubscribe,
// which the effect below must call — several sections use this hook at once and
// each needs its own live subscription.
//
// The current selection is seeded once on mount, since selection:update only
// fires on a *change*. That seed is the fragile part: it is a real API call (the
// event stream is a push and costs nothing, so it keeps working even when the
// board is rate limited). A failed seed must not read as "nothing is selected" —
// that is the same fabrication that made the Fields tab lie — so it is reported,
// surfaced, and retried.

import { useEffect, useState } from 'react';
import { failureReason, reportToLog } from '../features/diagnostics';
import { isBoardRateLimited } from '../features/hostStatus';
import type { SelectionItem } from '../ports/runtime';
import { services } from '../services';

// Slow on purpose: the failure this retries is usually an exhausted API credit
// budget, and the first user click supersedes it for free.
const SEED_RETRY_MS = 15_000;

export interface SelectionState {
  items: SelectionItem[];
  // Set when the selection could not be read at all. Not the same as nothing
  // being selected, which is `items: []` with `failure: null` — a consumer that
  // renders "nothing selected" has to check this first.
  failure: string | null;
}

export function useSelection(): SelectionState {
  const [state, setState] = useState<SelectionState>({ items: [], failure: null });

  useEffect(() => {
    const { runtime, canvas } = services();
    let cancelled = false;
    // Once a live event has arrived it is the truth, and the seed is stale
    // history no matter when it resolves.
    let live = false;
    let timer: number | null = null;
    const stopSeeding = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    const unsubscribe = runtime.onSelectionChange((items) => {
      live = true;
      stopSeeding();
      setState({ items, failure: null });
    });

    const seed = () => {
      if (cancelled || live) return;
      // Stand down while the board is asking to be left alone. Several sections
      // use this hook at once, so a rate-limited board otherwise takes one doomed
      // 500-credit read per instance per cycle, spending a budget that has
      // already run out. The failure already on screen stays on screen; the first
      // seed after the cooldown lapses is the probe. A user click supersedes all
      // of it for free (selection:update is a push).
      if (isBoardRateLimited()) return;
      void canvas
        .selection()
        .then((elements) => {
          if (cancelled || live) return;
          stopSeeding();
          setState({
            items: elements.map((el) => ({ id: el.id, kind: el.kind })),
            failure: null,
          });
        })
        .catch((error) => {
          if (cancelled || live) return;
          reportToLog('Could not read the current board selection', error);
          setState({ items: [], failure: failureReason(error) });
        });
    };

    seed();
    timer = window.setInterval(seed, SEED_RETRY_MS);
    return () => {
      cancelled = true;
      stopSeeding();
      unsubscribe();
    };
  }, []);

  return state;
}
