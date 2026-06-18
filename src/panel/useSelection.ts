// Tracks the board's current selection inside the panel. The panel page is a
// separate window from the headless board script, so registering here does not
// disturb the board's own selection flow; MiroRuntime guards the registration
// per page (HMR/StrictMode safe) and keeps the handler fresh via indirection,
// so no cleanup is needed. The current selection is seeded once on mount, since
// selection:update only fires on a *change*.

import { useEffect, useState } from 'react';
import type { SelectionItem } from '../ports/runtime';
import { services } from '../services';

export function useSelection(): SelectionItem[] {
  const [items, setItems] = useState<SelectionItem[]>([]);
  useEffect(() => {
    const { runtime, canvas } = services();
    runtime.onSelectionChange(setItems);
    void canvas
      .selection()
      .then((elements) => setItems(elements.map((el) => ({ id: el.id, kind: el.kind }))));
  }, []);
  return items;
}
