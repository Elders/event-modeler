// The Canvas port: a platform-neutral view of the infinite 2D modeling
// surface. Use-cases talk only to this interface; the Miro adapter (and any
// future standalone-app adapter) implements it.
//
// Design notes that make this portable:
//   * Queries return immutable CanvasElement *snapshots*, never live handles.
//   * Mutations are expressed as a batch of patches via `apply`, plus a few
//     structural ops — instead of the host's mutate-then-commit model.
//   * Coordinates are in each element's *local* space: relative to its parent
//     container if it has one, absolute otherwise. (`addToContainer` and
//     `settle` are the only operations that bridge the two spaces.)

import type { ElementMeta } from '../domain/meta';

export type ElementKind =
  | 'card'
  | 'image'
  | 'text'
  | 'container'
  | 'shape'
  | 'connector'
  | 'unknown';

// An immutable snapshot of one element on the canvas.
export interface CanvasElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
  content: string | null;
  color: string | null;
  title: string | null;
}

// A change to apply to an existing element. Omitted fields are left untouched.
export interface ElementPatch {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
}

export interface CardSpec {
  x: number;
  y: number;
  width: number;
  content: string;
  color: string;
  // A navigable reference to another element (e.g. a copy pointing at its
  // original). Adapters realize this however their canvas supports it.
  link?: string;
}

export interface ImageSpec {
  url: string;
  x: number;
  y: number;
  width: number;
}

export interface TextSpec {
  content: string;
  x: number;
  y: number;
  width: number;
  color?: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
}

export interface ContainerSpec {
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Background fill; 'transparent' for slices, a color for spec frames.
  fill: string;
}

export interface ShapeSpec {
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  fill?: string;
  fillOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  textColor?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  textAlignVertical?: 'top' | 'middle' | 'bottom';
}

export interface Canvas {
  // Creation. Each returns a snapshot of the created element.
  createCard(spec: CardSpec): Promise<CanvasElement>;
  createImage(spec: ImageSpec): Promise<CanvasElement>;
  createText(spec: TextSpec): Promise<CanvasElement>;
  createContainer(spec: ContainerSpec): Promise<CanvasElement>;
  createShape(spec: ShapeSpec): Promise<CanvasElement>;
  // A directional link between two elements, drawn in the canvas default style.
  createLink(fromId: string, toId: string): Promise<void>;

  // Queries.
  get(ids: string[]): Promise<CanvasElement[]>;
  containers(): Promise<CanvasElement[]>;
  childrenOf(containerId: string): Promise<CanvasElement[]>;
  selection(): Promise<CanvasElement[]>;

  // Mutations.
  apply(patches: ElementPatch[]): Promise<void>;
  addToContainer(containerId: string, childId: string, relX: number, relY: number): Promise<void>;
  group(ids: string[]): Promise<void>;
  remove(id: string): Promise<void>;

  // Metadata.
  setMeta(id: string, meta: ElementMeta): Promise<void>;
  getMeta(id: string): Promise<ElementMeta | null>;

  // Correct any platform auto-capture of a freshly created element, pinning it
  // to the intended absolute position. A canvas without auto-capture no-ops it.
  settle(id: string, absX: number, absY: number): Promise<void>;

  // Selection and references.
  deselect(): Promise<void>;
  deepLink(id: string): Promise<string | null>;
}
