// A design document: a platform-neutral extraction of a Figma file, reduced to
// exactly what drafting an event model needs — the screens and the click-through
// flow between them. Pure domain, zero platform deps, mirroring `plan.ts`: the
// Figma adapter produces a loosely-shaped object, `normalizeDesignDoc` coerces
// it into a safe `DesignDoc`, and `describeDesign` serializes that into the
// prompt handed to the (unchanged) Planner.
//
// The Figma REST types are deliberately NOT modeled here — that shape belongs to
// the adapter. The domain only knows frames, their labels, and the edges.

// One screen: a top-level Figma frame reduced to what the planner can use.
export interface DesignFrame {
  // Stable id derived from the Figma node id (sanitized to a safe token). Reused
  // as the screen block's ref in the plan, so links and image-binding resolve.
  ref: string;
  name: string;
  // Descendant text: button/CTA labels, headings, form-field labels — the raw
  // material the planner infers commands, events, and fields from.
  labels: string[];
  // The frame's rendered PNG, temporary and host-fetched at creation. null when
  // the render wasn't produced — a value (that screen falls back to a
  // placeholder), never an error.
  renderUrl: string | null;
}

// One prototype transition, resolved frame → frame: a click on the source screen
// navigates to the target screen. This is the flow graph the planner reads as
// "command → event → read model the next screen displays".
export interface FlowEdge {
  from: string; // source frame ref
  to: string; // destination frame ref
  trigger: string; // e.g. "click Place order" — interaction type + the node's label
}

export interface DesignDoc {
  frames: DesignFrame[];
  edges: FlowEdge[];
}

// --- Normalization -------------------------------------------------------
//
// The trust boundary for whatever the adapter extracted: keep only well-formed
// frames with unique refs, and edges whose endpoints are known frames (a
// dangling edge is dropped exactly as normalizePlan drops a link to an unknown
// block). Belt-and-braces even though our own extractor feeds it — the same
// discipline as normalizePlan, so a future adapter can't inject a bad shape.

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Text labels within a frame: trimmed, de-duplicated, blanks dropped. Capped so
// one enormous frame can't blow out the prompt (Phase 1 safety; a smarter budget
// is Phase 2).
const MAX_LABELS_PER_FRAME = 40;

function normalizeLabels(raw: unknown): string[] {
  const seen = new Set<string>();
  for (const value of asArray(raw)) {
    const label = asString(value);
    if (label) seen.add(label);
    if (seen.size >= MAX_LABELS_PER_FRAME) break;
  }
  return [...seen];
}

export function normalizeDesignDoc(raw: unknown): DesignDoc {
  const root = (raw ?? {}) as Record<string, unknown>;

  const frames: DesignFrame[] = [];
  const refs = new Set<string>();
  for (const rawFrame of asArray(root.frames)) {
    const f = (rawFrame ?? {}) as Record<string, unknown>;
    const ref = asString(f.ref);
    if (!ref || refs.has(ref)) continue; // a frame with no id, or a duplicate, can't anchor a block
    refs.add(ref);
    const url = asString(f.renderUrl);
    frames.push({
      ref,
      name: asString(f.name) || 'Screen',
      labels: normalizeLabels(f.labels),
      renderUrl: url.startsWith('https://') ? url : null,
    });
  }

  const edges: FlowEdge[] = [];
  const seenEdges = new Set<string>();
  for (const rawEdge of asArray(root.edges)) {
    const e = (rawEdge ?? {}) as Record<string, unknown>;
    const from = asString(e.from);
    const to = asString(e.to);
    if (!from || !to || from === to) continue;
    if (!refs.has(from) || !refs.has(to)) continue; // endpoint isn't a known frame
    const key = `${from}->${to}`;
    if (seenEdges.has(key)) continue; // one edge per frame pair is enough for the prompt
    seenEdges.add(key);
    edges.push({ from, to, trigger: asString(e.trigger) });
  }

  return { frames, edges };
}

// --- File key parsing ----------------------------------------------------
//
// Accepts a Figma file/design/proto URL or a bare file key. The key is the
// path segment after the file-kind marker; Figma keys are alphanumeric.

const FILE_URL = /figma\.com\/(?:design|file|proto)\/([A-Za-z0-9]+)/i;
const BARE_KEY = /^[A-Za-z0-9]{8,}$/;

export function parseFigmaFileKey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(FILE_URL);
  if (match) return match[1];
  // Someone may paste just the key rather than the whole URL.
  if (BARE_KEY.test(trimmed)) return trimmed;
  return null;
}

// --- Usability guard -----------------------------------------------------
//
// Whether the doc is worth planning. A wired prototype is the strongest signal;
// absent that, frames carrying real text are still modelable. Only the truly
// empty cases (no frames, or frames with neither flow nor content) are refused.
// A richer "this is a component library, not screens" detector is Phase 2 — this
// is the honest floor, not that detector.
export function looksLikeScreenFlow(doc: DesignDoc): boolean {
  if (doc.frames.length === 0) return false;
  if (doc.edges.length > 0) return true;
  return doc.frames.some((frame) => frame.labels.length > 0);
}

// --- Prompt serialization ------------------------------------------------
//
// A Figma import splits into two halves: FIGMA_ADDENDUM (the "how" — appended to
// the planner's shared, user-editable system prompt for this one call) and
// describeDesign (the "what" — the screens and flow, in the user message). One
// source of truth for each half: the modeling vocabulary and output contract
// stay in the shared preamble; the Figma-specific reading of screens+flow lives
// here; the data stays data. Both are platform-neutral prompt text, so the
// feature reads them from the domain and hands them to the Planner port — no
// second prompt to keep in sync, and the user's preamble edits still apply.

// Appended to the configured system prompt for a Figma import only (the text
// generator passes nothing). Teaches how to read the input describeDesign emits.
export const FIGMA_ADDENDUM = `This request comes from a Figma design, not prose. The user message lists the design's SCREENS — each with a ref and its text labels — and the FLOW of clicks between them. Build the event model from that:
- Create one screen block per listed screen, and REUSE the given ref as that block's ref. This is required: links and the screen's own image are bound by that ref.
- Read each flow edge "A [trigger] -> B" as a step: the interaction on screen A is a command that emits an event, which updates the read model screen B displays. Order the slices to follow the flow.
- Infer each block's fields from the labels shown for the relevant screens (form inputs, headings, list columns).
- A screen with no incoming flow is an entry point; a screen that only displays data (a list or dashboard) is a read model, not a command.
Group the slices and write specs exactly as for any model.`;

const MAX_FRAMES_IN_PROMPT = 60; // keep the prompt bounded on huge files (Phase 1)

// The data half: the screens (ref, name, labels) and the flow edges, named so
// the model drafts over facts instead of inventing the graph. The instructions
// for reading it live in FIGMA_ADDENDUM, on the system side.
export function describeDesign(doc: DesignDoc): string {
  const frames = doc.frames.slice(0, MAX_FRAMES_IN_PROMPT);
  const nameByRef = new Map(doc.frames.map((f) => [f.ref, f.name] as const));

  const screenLines = frames.map((frame) => {
    const labels = frame.labels.length ? ` — labels: ${frame.labels.join(', ')}` : '';
    return `- ref ${frame.ref} "${frame.name}"${labels}`;
  });

  // Only edges whose endpoints both survived the frame cap.
  const shownRefs = new Set(frames.map((f) => f.ref));
  const flowLines = doc.edges
    .filter((edge) => shownRefs.has(edge.from) && shownRefs.has(edge.to))
    .map((edge) => {
      const from = nameByRef.get(edge.from) ?? edge.from;
      const to = nameByRef.get(edge.to) ?? edge.to;
      const trigger = edge.trigger ? ` [${edge.trigger}]` : '';
      return `- "${from}"${trigger} -> "${to}"`;
    });

  const flowSection = flowLines.length
    ? `\n\nFLOW (a click on the source screen navigates to the target screen):\n${flowLines.join('\n')}`
    : '\n\nFLOW: none captured — infer likely transitions from the screens.';

  return (
    `Screens and click-through flow extracted from a Figma design ` +
    `(${frames.length} screen${frames.length === 1 ? '' : 's'}).\n\n` +
    `SCREENS:\n${screenLines.join('\n')}` +
    flowSection
  );
}
