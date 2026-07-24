// Walk a Figma file's document tree into the raw shape a DesignDoc is built
// from: the top-level frames (screens), the text beneath each, and the
// click-through flow between them read off the prototype interactions. This is
// the one place that knows the Figma REST node shape; the domain's
// normalizeDesignDoc is the real trust boundary, so this stays a permissive walk
// guarded on arrays and strings rather than a strict schema.

import type { FlowEdge } from '../../domain/designDoc';

// The slice of the Figma node shape we read. Everything optional — the parsed
// body is untrusted.
interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  characters?: string;
  children?: FigmaNode[];
  // Legacy prototype link: the destination node's id.
  transitionNodeID?: string | null;
  // Modern prototype links: triggers with actions carrying a destinationId.
  interactions?: FigmaInteraction[];
}
interface FigmaInteraction {
  trigger?: { type?: string };
  actions?: FigmaAction[];
}
interface FigmaAction {
  type?: string;
  destinationId?: string | null;
}

// A frame before rendering: both the original Figma node id (needed by the
// /v1/images endpoint) and the sanitized ref the plan will echo.
export interface RawFrame {
  id: string;
  ref: string;
  name: string;
  labels: string[];
}

export interface RawExtract {
  frames: RawFrame[];
  edges: FlowEdge[];
}

// Bound the work and the images-endpoint URL length on huge files (Phase 1).
const MAX_FRAMES = 100;

// A Figma node id ("12:345") sanitized to a ref safe to echo through the plan.
function toRef(nodeId: string): string {
  return `screen-${nodeId.replace(/[^A-Za-z0-9]+/g, '-')}`;
}

function childrenOf(node: FigmaNode): FigmaNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

// Every TEXT string beneath a node, in document order.
function collectLabels(node: FigmaNode, into: string[]): void {
  if (node.type === 'TEXT' && typeof node.characters === 'string') {
    const text = node.characters.trim();
    if (text) into.push(text);
  }
  for (const child of childrenOf(node)) collectLabels(child, into);
}

// A short label for a node that owns an interaction (a button): its own text,
// else the first text beneath it, else its layer name.
function nodeLabel(node: FigmaNode): string {
  const texts: string[] = [];
  collectLabels(node, texts);
  if (texts[0]) return texts[0];
  return typeof node.name === 'string' ? node.name.trim() : '';
}

// Top-level frames: FRAME nodes sitting directly on a page (canvas) or inside a
// section on a page. Nested frames (components within a screen) are excluded so
// a screen isn't mistaken for many.
function collectScreenFrames(document: FigmaNode): FigmaNode[] {
  const frames: FigmaNode[] = [];
  for (const page of childrenOf(document)) {
    if (page.type !== 'CANVAS') continue;
    for (const node of childrenOf(page)) {
      if (node.type === 'FRAME') frames.push(node);
      else if (node.type === 'SECTION') {
        for (const inner of childrenOf(node)) {
          if (inner.type === 'FRAME') frames.push(inner);
        }
      }
    }
  }
  return frames;
}

// Map every node id in a subtree to the screen ref that contains it, so a
// transition landing anywhere inside a screen resolves to that screen.
function indexDescendants(node: FigmaNode, ref: string, into: Map<string, string>): void {
  if (typeof node.id === 'string') into.set(node.id, ref);
  for (const child of childrenOf(node)) indexDescendants(child, ref, into);
}

// Destination node ids a node's prototype links point at — modern interactions
// and the legacy single-transition field, together.
function transitionDestinations(node: FigmaNode): string[] {
  const dests: string[] = [];
  if (typeof node.transitionNodeID === 'string' && node.transitionNodeID) {
    dests.push(node.transitionNodeID);
  }
  if (Array.isArray(node.interactions)) {
    for (const interaction of node.interactions) {
      const actions = Array.isArray(interaction?.actions) ? interaction.actions : [];
      for (const action of actions) {
        if (action?.type === 'NODE' && typeof action.destinationId === 'string' && action.destinationId) {
          dests.push(action.destinationId);
        }
      }
    }
  }
  return dests;
}

// The trigger word for a node's first interaction ("ON_CLICK" -> "click"); a
// legacy transitionNodeID carries no trigger, so a click is assumed.
function triggerWord(node: FigmaNode): string {
  let type = 'ON_CLICK';
  if (Array.isArray(node.interactions)) {
    for (const interaction of node.interactions) {
      const t = interaction?.trigger?.type;
      if (typeof t === 'string' && t) {
        type = t;
        break;
      }
    }
  }
  const word = type.replace(/^ON_/, '').replace(/_/g, ' ').toLowerCase();
  return word || 'tap';
}

// "click Place order" — the trigger word plus the interacting node's label.
function triggerLabel(node: FigmaNode): string {
  const label = nodeLabel(node);
  const word = triggerWord(node);
  return label ? `${word} ${label}` : word;
}

function collectEdges(
  screens: FigmaNode[],
  validRefs: Set<string>,
  refByDescendant: Map<string, string>,
): FlowEdge[] {
  const edges: FlowEdge[] = [];
  const walk = (node: FigmaNode, fromRef: string): void => {
    for (const dest of transitionDestinations(node)) {
      const toRef = refByDescendant.get(dest);
      if (toRef && validRefs.has(toRef) && toRef !== fromRef) {
        edges.push({ from: fromRef, to: toRef, trigger: triggerLabel(node) });
      }
    }
    for (const child of childrenOf(node)) walk(child, fromRef);
  };
  for (const screen of screens) {
    const ref = typeof screen.id === 'string' ? refByDescendant.get(screen.id) : undefined;
    if (ref) walk(screen, ref);
  }
  return edges;
}

// Build the extract from a set of screen frame nodes, each a full subtree.
function buildExtract(screens: FigmaNode[]): RawExtract {
  const frames: RawFrame[] = [];
  const refByDescendant = new Map<string, string>();
  for (const node of screens) {
    const id = typeof node.id === 'string' ? node.id : '';
    if (!id) continue;
    const ref = toRef(id);
    const labels: string[] = [];
    collectLabels(node, labels);
    frames.push({
      id,
      ref,
      name: typeof node.name === 'string' && node.name.trim() ? node.name.trim() : 'Screen',
      labels,
    });
    indexDescendants(node, ref, refByDescendant);
  }
  const validRefs = new Set(frames.map((f) => f.ref));
  const edges = collectEdges(screens, validRefs, refByDescendant);
  return { frames, edges };
}

// Walk a full file response into the raw extract: the top-level screen frames
// and the flow between them.
export function extractDesign(fileBody: unknown): RawExtract {
  const document = ((fileBody ?? {}) as { document?: FigmaNode }).document ?? {};
  return buildExtract(collectScreenFrames(document).slice(0, MAX_FRAMES));
}

// The render URLs from a /v1/images response, keyed by original node id. A null
// (Figma couldn't render that frame) is a value, carried through as null.
export function extractImageUrls(body: unknown): Record<string, string | null> {
  const images = ((body ?? {}) as { images?: unknown }).images;
  if (!images || typeof images !== 'object') return {};
  const out: Record<string, string | null> = {};
  for (const [id, url] of Object.entries(images as Record<string, unknown>)) {
    out[id] = typeof url === 'string' ? url : null;
  }
  return out;
}
