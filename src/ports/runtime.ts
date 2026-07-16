// The Runtime port: host lifecycle events the tool reacts to. The Miro adapter
// guards each registration so repeated module evaluation (HMR, StrictMode)
// cannot stack listeners; a standalone host wires its own equivalents.

import type { PaletteKind } from '../domain/vocabulary';
import type { ElementKind } from './canvas';

// The minimal element identity a selection event carries.
export type SelectionItem = { id: string; kind: ElementKind };

// A palette tile dropped onto the canvas at an absolute point.
export type DropInfo = { x: number; y: number; kind: PaletteKind };

export interface Runtime {
  // Selection has many independent listeners (the panel alone has three), so
  // this is a subscription, not a single slot, and it returns the way to end it.
  // A caller that can go away — a React component — must call that on unmount.
  onSelectionChange(handler: (items: SelectionItem[]) => void): () => void;
  onIconClick(handler: () => void): void;
  onDrop(handler: (drop: DropInfo) => void): void;
  openPanel(url: string): Promise<void>;
}
