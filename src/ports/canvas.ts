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

// An immutable snapshot of one connector (arrow). Endpoints are the ids of the
// items the connector attaches to, or null when an end floats free; color is
// the current stroke color (the canvas default when never overridden).
export interface CanvasConnector {
  id: string;
  start: string | null;
  end: string | null;
  color: string | null;
}

// A group and the ids of its member items. Used to resolve a connector that
// attaches to a grouped element (a screen/automation is a title+image+box
// group) back to the member that carries the data.
export interface CanvasGroup {
  id: string;
  members: string[];
}

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
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  textAlignVertical?: 'top' | 'middle' | 'bottom';
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

// A free-standing arrow: a connector between two absolute points (not attached
// to any item), drawn in the canvas default style except for an optional color
// and thickness, with an optional caption carried on the line itself. Used for
// the Chapter marker.
export interface ArrowSpec {
  start: { x: number; y: number };
  end: { x: number; y: number };
  color?: string;
  thickness?: number;
  // Caption rendered on the connector (above the line), with its own color/size.
  text?: string;
  textColor?: string;
  fontSize?: number;
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
  // A free-standing arrow between two points (the Chapter marker).
  createArrow(spec: ArrowSpec): Promise<CanvasElement>;

  // Queries.
  get(ids: string[]): Promise<CanvasElement[]>;
  containers(): Promise<CanvasElement[]>;
  childrenOf(containerId: string): Promise<CanvasElement[]>;
  connectors(): Promise<CanvasConnector[]>;
  groups(): Promise<CanvasGroup[]>;
  selection(): Promise<CanvasElement[]>;

  // Mutations.
  apply(patches: ElementPatch[]): Promise<void>;
  addToContainer(containerId: string, childId: string, relX: number, relY: number): Promise<void>;
  group(ids: string[]): Promise<void>;
  // The ids of every item grouped with the given one (itself included; just
  // itself when ungrouped), so a new attachment can re-group with the whole set
  // instead of splitting the element out of its existing group.
  groupMembers(id: string): Promise<string[]>;
  remove(id: string): Promise<void>;
  // Sets a connector's stroke color (used by the completeness check to flag and
  // restore arrows). Connectors otherwise carry no app style overrides.
  setConnectorColor(id: string, color: string): Promise<void>;

  // Metadata.
  setMeta(id: string, meta: ElementMeta): Promise<void>;
  getMeta(id: string): Promise<ElementMeta | null>;

  // Correct any platform auto-capture of a freshly created element, pinning it
  // to the intended absolute position. A canvas without auto-capture no-ops it.
  settle(id: string, absX: number, absY: number): Promise<void>;

  // Hint that a burst of writes is coming (model generation); the adapter may
  // pace them to stay under a host rate limit. A no-op where there is no limit.
  // An optional signal lets the adapter drop pacing the moment the run aborts,
  // so a Pause isn't drawn out by the remaining gaps.
  setBulkMode(on: boolean, signal?: AbortSignal): void;

  // Selection and references.
  deselect(): Promise<void>;
  deepLink(id: string): Promise<string | null>;
}
