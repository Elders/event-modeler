// The Runtime port: host lifecycle events the tool reacts to. The Miro adapter
// guards each registration so repeated module evaluation (HMR, StrictMode)
// cannot stack listeners; a standalone host wires its own equivalents.

import type { BlockType } from '../domain/vocabulary';
import type { ElementKind } from './canvas';

// The minimal element identity a selection event carries.
export type SelectionItem = { id: string; kind: ElementKind };

// A palette tile dropped onto the canvas at an absolute point.
export type DropInfo = { x: number; y: number; blockType: BlockType };

export interface Runtime {
  onSelectionChange(handler: (items: SelectionItem[]) => void): void;
  onIconClick(handler: () => void): void;
  onDrop(handler: (drop: DropInfo) => void): void;
  openPanel(url: string): Promise<void>;
}
