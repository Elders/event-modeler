// Registers the board drop listener exactly once per panel load, OUTSIDE the
// React lifecycle: StrictMode double-mounts effects, Vite HMR re-evaluates
// the module, and ui.off does not reliably deregister — stacked registrations
// mean one drop creates several copies and can leave the drag ghost stuck in
// the panel. The window flag survives both; the indirection keeps the handler
// fresh across HMR.

import type { BlockType } from '../blocks';
import { createBlock } from '../features/createBlock';
import { reportError } from '../miro/helpers';

// Shape of the SDK's drop event; `target` is the panel element that was dragged.
type DropEvent = { x: number; y: number; target: HTMLElement };

// Drops of the same block type at the same spot within half a second are
// treated as duplicate firings, not intent.
let lastDrop = { key: '', time: 0 };

async function handleDrop({ x, y, target }: DropEvent) {
  const type = target.getAttribute('data-block') as BlockType | null;
  if (!type) return;
  const key = `${type}:${Math.round(x)}:${Math.round(y)}`;
  const now = Date.now();
  if (key === lastDrop.key && now - lastDrop.time < 500) return;
  lastDrop = { key, time: now };
  try {
    await createBlock(type, x, y);
  } catch (error) {
    await reportError(error);
  }
}

declare global {
  interface Window {
    __emDropHandler?: (event: DropEvent) => void;
    __emDropRegistered?: boolean;
  }
}

export function registerDropHandler() {
  window.__emDropHandler = (event) => void handleDrop(event);
  if (!window.__emDropRegistered) {
    window.__emDropRegistered = true;
    miro.board.ui.on('drop', (event: DropEvent) => window.__emDropHandler?.(event));
  }
}
