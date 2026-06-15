// Wires palette drops to block creation through the Runtime port. Drops of the
// same block type at the same spot within half a second are treated as
// duplicate firings, not intent (the host can double-fire).

import { services } from '../services';
import { createBlock } from './createBlock';
import { reportError } from './helpers';

let lastDrop = { key: '', time: 0 };

export function registerDrop(): void {
  services().runtime.onDrop(async ({ x, y, blockType }) => {
    const key = `${blockType}:${Math.round(x)}:${Math.round(y)}`;
    const now = Date.now();
    if (key === lastDrop.key && now - lastDrop.time < 500) return;
    lastDrop = { key, time: now };
    try {
      await createBlock(blockType, x, y);
    } catch (error) {
      await reportError(error);
    }
  });
}
