// The model plan: a platform-neutral description of an event model the tool can
// build, produced by the Planner port from a block of prose. Pure domain — it
// reuses the event-modeling vocabulary and carries only the data and layout
// math needed to lay slices out along the timeline, with zero platform deps.
//
// `normalizePlan` is the trust boundary for whatever a Planner returns: it
// coerces a loosely-shaped object into a safe ModelPlan, dropping anything that
// doesn't reference real blocks so the build step can assume well-formed data.

import type { FieldType } from './fields';
import { STICKY_LABEL, type BlockType, type StickyBlockType } from './vocabulary';

// Every block a plan may place — the full vocabulary minus 'slice', since slices
// are the containers blocks live in, not blocks themselves.
export type PlannableBlockType = Exclude<BlockType, 'slice'>;

const PLANNABLE_TYPES: PlannableBlockType[] = [
  'event',
  'command',
  'readModel',
  'externalEvent',
  'error',
  'automation',
  'screen',
];

const STICKY_TYPES: StickyBlockType[] = ['event', 'command', 'readModel', 'externalEvent', 'error'];

// The three conventional lanes, top to bottom: screens (-1),
// commands & read models (0), events (1).
export type PlanLane = -1 | 0 | 1;

// The lane a block conventionally sits in, used when a plan omits or mis-tags it.
const DEFAULT_LANE: Record<PlannableBlockType, PlanLane> = {
  screen: -1,
  command: 0,
  readModel: 0,
  automation: 0,
  event: 1,
  externalEvent: 1,
  error: 1,
};

// A typed datum a block carries. The generator restricts a field's type to the
// concrete set (no free-text "custom"), so the plan stays machine-checkable.
export interface PlannedField {
  name: string;
  type: FieldType;
}

const PLAN_FIELD_TYPES: FieldType[] = ['string', 'number', 'date', 'time', 'datetime', 'uuid'];

export interface PlannedBlock {
  ref: string;
  type: PlannableBlockType;
  label: string;
  lane: PlanLane;
  // Column within the slice (0-based), so a slice can hold a multi-step flow.
  column: number;
  // Data the block carries (name + type); empty for blocks without data.
  fields: PlannedField[];
}

export interface PlannedSlice {
  ref: string;
  title: string;
  blocks: PlannedBlock[];
}

// A Given/When/Then specification attached to a slice. Each zone lists the refs
// of the (sticky) blocks whose linked copies populate it.
export interface PlannedSpec {
  slice: string;
  title: string;
  given: string[];
  when: string[];
  then: string[];
}

export interface PlannedLink {
  from: string;
  to: string;
}

export interface ModelPlan {
  slices: PlannedSlice[];
  links: PlannedLink[];
  specs: PlannedSpec[];
}

// --- Normalization -------------------------------------------------------

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asLane(value: unknown, fallback: PlanLane): PlanLane {
  return value === -1 || value === 0 || value === 1 ? value : fallback;
}

function isStickyType(type: PlannableBlockType): type is StickyBlockType {
  return (STICKY_TYPES as PlannableBlockType[]).includes(type);
}

// Keep only well-formed fields: a non-empty name and one of the concrete types.
function normalizeFields(raw: unknown): PlannedField[] {
  const fields: PlannedField[] = [];
  for (const rawField of asArray(raw)) {
    const f = (rawField ?? {}) as Record<string, unknown>;
    const name = asString(f.name);
    const type = asString(f.type) as FieldType;
    if (!name || !PLAN_FIELD_TYPES.includes(type)) continue;
    fields.push({ name, type });
  }
  return fields;
}

// Coerce a loosely-shaped Planner result into a safe ModelPlan: keep only
// well-typed blocks with unique refs, links between known blocks, and spec-zone
// references that point at real sticky cards (only cards can be copied).
export function normalizePlan(raw: unknown): ModelPlan {
  const root = (raw ?? {}) as Record<string, unknown>;
  const seenRefs = new Set<string>();
  const stickyRefs = new Set<string>();
  const allRefs = new Set<string>();

  const slices: PlannedSlice[] = [];
  for (const rawSlice of asArray(root.slices)) {
    const s = (rawSlice ?? {}) as Record<string, unknown>;
    let ref = asString(s.ref);
    if (!ref || seenRefs.has(ref)) ref = uniqueRef('slice', seenRefs);
    seenRefs.add(ref);

    const blocks: PlannedBlock[] = [];
    for (const rawBlock of asArray(s.blocks)) {
      const b = (rawBlock ?? {}) as Record<string, unknown>;
      const type = asString(b.type) as PlannableBlockType;
      if (!PLANNABLE_TYPES.includes(type)) continue;
      let blockRef = asString(b.ref);
      if (!blockRef || seenRefs.has(blockRef)) blockRef = uniqueRef('block', seenRefs);
      seenRefs.add(blockRef);
      allRefs.add(blockRef);
      if (isStickyType(type)) stickyRefs.add(blockRef);

      const label = asString(b.label) || STICKY_LABEL[type as StickyBlockType] || type;
      const column = Number.isFinite(b.column) ? Math.max(0, Math.floor(b.column as number)) : 0;
      blocks.push({
        ref: blockRef,
        type,
        label,
        lane: asLane(b.lane, DEFAULT_LANE[type]),
        column,
        fields: normalizeFields(b.fields),
      });
    }
    if (blocks.length === 0) continue;
    slices.push({ ref, title: asString(s.title) || 'Slice', blocks });
  }

  const sliceRefs = new Set(slices.map((s) => s.ref));

  const links: PlannedLink[] = [];
  const seenLinks = new Set<string>();
  for (const rawLink of asArray(root.links)) {
    const l = (rawLink ?? {}) as Record<string, unknown>;
    const from = asString(l.from);
    const to = asString(l.to);
    if (!from || !to || from === to) continue;
    if (!allRefs.has(from) || !allRefs.has(to)) continue;
    const key = `${from}->${to}`;
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    links.push({ from, to });
  }

  const keepStickies = (refs: unknown): string[] =>
    asArray(refs)
      .map(asString)
      .filter((ref) => stickyRefs.has(ref));

  const specs: PlannedSpec[] = [];
  for (const rawSpec of asArray(root.specs)) {
    const sp = (rawSpec ?? {}) as Record<string, unknown>;
    const slice = asString(sp.slice);
    if (!sliceRefs.has(slice)) continue;
    const given = keepStickies(sp.given);
    const when = keepStickies(sp.when);
    const then = keepStickies(sp.then);
    if (given.length + when.length + then.length === 0) continue;
    specs.push({ slice, title: asString(sp.title), given, when, then });
  }

  return { slices, links, specs };
}

function uniqueRef(prefix: string, taken: Set<string>): string {
  let i = 1;
  let ref = `${prefix}-${i}`;
  while (taken.has(ref)) ref = `${prefix}-${++i}`;
  return ref;
}

// --- Layout math ---------------------------------------------------------
//
// Slices are laid left-to-right along the timeline; within a slice, columns
// step right and lanes step down. These are pure numbers over the plan, so the
// feature layer can place everything without any platform knowledge.

export const PLAN_COL_STEP = 480;
export const PLAN_LANE_STEP = 500; // matches a slice's per-lane height
export const PLAN_SLICE_GAP = 80;
export const PLAN_SLICE_PADDING = 90;
export const PLAN_SLICE_MIN_WIDTH = 700;
export const PLAN_SLICE_HEIGHT = 1500; // spans the three lanes

// Number of columns a slice occupies (its widest column index + 1).
export function sliceColumns(slice: PlannedSlice): number {
  return Math.max(1, ...slice.blocks.map((b) => b.column + 1));
}

export function sliceWidth(slice: PlannedSlice): number {
  return Math.max(PLAN_SLICE_MIN_WIDTH, sliceColumns(slice) * PLAN_COL_STEP + PLAN_SLICE_PADDING * 2);
}

export interface SlicePlacement {
  slice: PlannedSlice;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

// Places every slice in a row centered on (cx, cy), each as wide as its content.
export function placeSlices(plan: ModelPlan, cx: number, cy: number): SlicePlacement[] {
  const widths = plan.slices.map(sliceWidth);
  const total =
    widths.reduce((sum, w) => sum + w, 0) + PLAN_SLICE_GAP * Math.max(0, plan.slices.length - 1);
  let left = cx - total / 2;
  return plan.slices.map((slice, i) => {
    const width = widths[i];
    const centerX = left + width / 2;
    left += width + PLAN_SLICE_GAP;
    return { slice, centerX, centerY: cy, width, height: PLAN_SLICE_HEIGHT };
  });
}

// Absolute position of one block within its placed slice.
export function blockPosition(
  placement: SlicePlacement,
  block: PlannedBlock,
): { x: number; y: number } {
  const columns = sliceColumns(placement.slice);
  const colOffset = (block.column - (columns - 1) / 2) * PLAN_COL_STEP;
  return {
    x: placement.centerX + colOffset,
    y: placement.centerY + block.lane * PLAN_LANE_STEP,
  };
}
