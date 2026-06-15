// The Miro implementation of the Runtime port. Each registration is guarded by
// a window flag so repeated module evaluation (Vite HMR, React StrictMode)
// cannot stack listeners — `ui.off` is unreliable — and a handler indirection
// keeps the active logic fresh across hot reloads.

import type { BlockType } from '../../domain/vocabulary';
import type { ElementKind } from '../../ports/canvas';
import type { DropInfo, Runtime, SelectionItem } from '../../ports/runtime';

type MiroSelectionEvent = { items: { id: string; type: string }[] };
type MiroDropEvent = { x: number; y: number; target: HTMLElement };

declare global {
  interface Window {
    __emSelHandler?: (event: MiroSelectionEvent) => void;
    __emSelRegistered?: boolean;
    __emDropHandler?: (event: MiroDropEvent) => void;
    __emDropRegistered?: boolean;
    __emIconHandler?: () => void;
    __emIconRegistered?: boolean;
  }
}

function kindOf(type: string): ElementKind {
  switch (type) {
    case 'sticky_note':
      return 'card';
    case 'image':
      return 'image';
    case 'text':
      return 'text';
    case 'frame':
      return 'container';
    case 'shape':
      return 'shape';
    case 'connector':
      return 'connector';
    default:
      return 'unknown';
  }
}

export class MiroRuntime implements Runtime {
  onSelectionChange(handler: (items: SelectionItem[]) => void): void {
    window.__emSelHandler = (event) =>
      handler(event.items.map((item) => ({ id: item.id, kind: kindOf(item.type) })));
    if (!window.__emSelRegistered) {
      window.__emSelRegistered = true;
      miro.board.ui.on('selection:update', (event: MiroSelectionEvent) =>
        window.__emSelHandler?.(event),
      );
    }
  }

  onDrop(handler: (drop: DropInfo) => void): void {
    window.__emDropHandler = (event) => {
      const blockType = event.target.getAttribute('data-block') as BlockType | null;
      if (!blockType) return;
      handler({ x: event.x, y: event.y, blockType });
    };
    if (!window.__emDropRegistered) {
      window.__emDropRegistered = true;
      miro.board.ui.on('drop', (event: MiroDropEvent) => window.__emDropHandler?.(event));
    }
  }

  onIconClick(handler: () => void): void {
    window.__emIconHandler = handler;
    if (!window.__emIconRegistered) {
      window.__emIconRegistered = true;
      miro.board.ui.on('icon:click', () => window.__emIconHandler?.());
    }
  }

  async openPanel(url: string): Promise<void> {
    await miro.board.ui.openPanel({ url });
  }
}
