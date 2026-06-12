// Shared busy state for panel actions: one action at a time, errors surfaced
// as toasts with the real reason.

import { useState } from 'react';
import { reportError } from '../miro/helpers';

export function useBusyGuard() {
  const [busy, setBusy] = useState(false);
  const guard = (action: () => Promise<unknown>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      await reportError(error);
    } finally {
      setBusy(false);
    }
  };
  return { busy, guard };
}

export type Guard = ReturnType<typeof useBusyGuard>['guard'];
