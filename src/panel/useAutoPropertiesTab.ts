// Brings the Properties tab forward when the board selection becomes something
// it can act on: a single connector (the arrow toolset, or a chapter's name) or
// a selection resolving to exactly one field-bearing block (the editor) — the
// same conditions PropertiesSection itself acts under, so the jump never lands
// on a refusal. Deliberately NOT extended to frames and shapes, even though the
// tab can now name them: selecting a slice to move it or a swimlane to resize
// it is everyday board work, and yanking the panel over on every such click
// would make the jump a nuisance instead of a shortcut.
//
// Live selection events only, never the seeded read: the trigger is the *act*
// of selecting while the panel is open, not the state of something sitting
// selected — a panel opened over an old selection must not jump on its own.
// That also makes a manual tab choice stick: leaving Properties with the block
// still selected fires no new event, so nothing drags the user back.

import { useEffect } from 'react';
import { reportToLog } from '../features/diagnostics';
import { resolveFieldTargets } from '../features/fields/recognize';
import { isBoardRateLimited } from '../features/hostStatus';
import type { SelectionItem } from '../ports/runtime';
import { services } from '../services';
import type { PanelTabId } from './PanelTabs';

export function useAutoPropertiesTab(tab: PanelTabId, setTab: (id: PanelTabId) => void) {
  useEffect(() => {
    // Already there — don't spend reads confirming it. PropertiesSection owns
    // the selection while it is on screen.
    if (tab === 'properties') return;
    let cancelled = false;

    const consider = async (items: SelectionItem[]) => {
      // Exactly one connector selected: PropertiesSection becomes the arrow
      // toolset (or a chapter's name editor). The event already carries the
      // kind, so this costs nothing.
      if (items.length === 1 && items[0].kind === 'connector') {
        setTab('properties');
        return;
      }
      // The element case costs metadata reads. Nobody asked for this jump by
      // name, so it stands down while the board is asking to be left alone —
      // the click that would have jumped still works once credits return.
      if (isBoardRateLimited()) return;
      const targets = await resolveFieldTargets(items);
      if (cancelled) return;
      if (targets.length === 1) setTab('properties');
    };

    const unsubscribe = services().runtime.onSelectionChange((items) => {
      // Supervisor: a failed resolution must not become an unhandled
      // rejection. Not switching is not an answer, so nothing is fabricated —
      // the failure is reported and the next selection event tries afresh.
      void consider(items).catch((error) => {
        if (cancelled) return;
        reportToLog('Could not resolve the selection for the Properties tab jump', error);
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
