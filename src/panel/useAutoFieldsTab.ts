// Brings the Fields tab forward when the board selection becomes something it
// can act on: a single connector (the arrow toolset) or a selection resolving
// to exactly one field-bearing block (the editor) — the same two conditions
// FieldsSection itself acts under, so the jump never lands on a refusal.
//
// Live selection events only, never the seeded read: the trigger is the *act*
// of selecting while the panel is open, not the state of something sitting
// selected — a panel opened over an old selection must not jump on its own.
// That also makes a manual tab choice stick: leaving Fields with the block
// still selected fires no new event, so nothing drags the user back.

import { useEffect } from 'react';
import { reportToLog } from '../features/diagnostics';
import { resolveFieldTargets } from '../features/fields/recognize';
import { isBoardRateLimited } from '../features/hostStatus';
import type { SelectionItem } from '../ports/runtime';
import { services } from '../services';
import type { PanelTabId } from './PanelTabs';

export function useAutoFieldsTab(tab: PanelTabId, setTab: (id: PanelTabId) => void) {
  useEffect(() => {
    // Already there — don't spend reads confirming it. FieldsSection owns the
    // selection while it is on screen.
    if (tab === 'fields') return;
    let cancelled = false;

    const consider = async (items: SelectionItem[]) => {
      // Exactly one connector selected: FieldsSection becomes the arrow
      // toolset. The event already carries the kind, so this costs nothing.
      if (items.length === 1 && items[0].kind === 'connector') {
        setTab('fields');
        return;
      }
      // The element case costs metadata reads. Nobody asked for this jump by
      // name, so it stands down while the board is asking to be left alone —
      // the click that would have jumped still works once credits return.
      if (isBoardRateLimited()) return;
      const targets = await resolveFieldTargets(items);
      if (cancelled) return;
      if (targets.length === 1) setTab('fields');
    };

    const unsubscribe = services().runtime.onSelectionChange((items) => {
      // Supervisor: a failed resolution must not become an unhandled
      // rejection. Not switching is not an answer, so nothing is fabricated —
      // the failure is reported and the next selection event tries afresh.
      void consider(items).catch((error) => {
        if (cancelled) return;
        reportToLog('Could not resolve the selection for the Fields tab jump', error);
      });
    });

    // Re-subscribing on every tab change is free (a local Set in the runtime),
    // and cancelling on cleanup means a resolution still in flight when the
    // user picks a tab by hand cannot override that choice.
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [tab, setTab]);
}
