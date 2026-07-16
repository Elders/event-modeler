// The Miro implementation of the Runtime port. Each registration is guarded by
// a window flag so repeated module evaluation (Vite HMR, React StrictMode)
// cannot stack listeners — `ui.off` is unreliable — and a handler indirection
// keeps the active logic fresh across hot reloads.

import type { PaletteKind } from '../../domain/vocabulary';
import type { ElementKind } from '../../ports/canvas';
import type { DropInfo, Runtime, SelectionItem } from '../../ports/runtime';

type MiroSelectionEvent = { items: { id: string; type: string }[] };
type MiroDropEvent = { x: number; y: number; target: HTMLElement };

declare global {
  interface Window {
    __emSelSubs?: Set<(items: SelectionItem[]) => void>;
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
  // A set of subscribers, not the single handler slot this used to be. The slot
  // silently broke every listener but the last one to register: on the panel's
  // Build tab, ConvertSection's effect ran after BuildingBlocksSection's and
  // overwrote it, freezing the latter's selection for the life of the page.
  //
  // The set lives on `window` for the same reason the registration flag does —
  // HMR re-evaluates this module, and an instance field would start a fresh set
  // while the SDK listener (registered once per page) kept reading the old one.
  onSelectionChange(handler: (items: SelectionItem[]) => void): () => void {
    const subscribers = (window.__emSelSubs ??= new Set());
    subscribers.add(handler);
    if (!window.__emSelRegistered) {
      window.__emSelRegistered = true;
      miro.board.ui.on('selection:update', (event: MiroSelectionEvent) => {
        const items = event.items.map((item) => ({ id: item.id, kind: kindOf(item.type) }));
        // Read the set through window each time (HMR freshness), and iterate a
        // copy: a subscriber may unsubscribe while being notified — a component
        // unmounting on this very selection — and mutating a Set mid-iteration
        // skips the next subscriber.
        for (const subscriber of [...(window.__emSelSubs ?? [])]) subscriber(items);
      });
    }
    return () => {
      subscribers.delete(handler);
    };
  }

  onDrop(handler: (drop: DropInfo) => void): void {
    window.__emDropHandler = (event) => {
      const kind = event.target.getAttribute('data-block') as PaletteKind | null;
      if (!kind) return;
      handler({ x: event.x, y: event.y, kind });
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
