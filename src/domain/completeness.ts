// Information-completeness check: a pure data-flow rule over the model. An
// element that carries fields draws them from the elements pointing into it,
// and the check is judged per *target*: everything pointing into a target pools
// its fields, and the target is satisfied when that pool covers every field the
// target declares, matched by name and type (a differing type counts as
// missing). Only a source's *required* fields supply — a field that may be
// absent can't guarantee one that must be present. A read model hydrated by
// several events is the motivating case — each event carries its own slice of
// the whole, and no single one has to carry all of it. When the pool falls
// short, every arrow into that target is flagged: the gap belongs to the
// target's fan-in, not to any one arrow, and closing it on any one source clears
// them all. No platform here: just the model graph and its fields, so it ports
// unchanged to any canvas.

import { escapeHtml, fieldMatchKey, type Field } from './fields';

// One field-bearing element: its id and the fields it declares.
export interface FieldedElement {
  id: string;
  fields: Field[];
}

// One missing field behind a flagged arrow: the key the target requires that
// nothing feeding it guarantees, and whether the fan-in carries that exact
// name+type but only as an *optional* field. Both are gaps — the distinction
// only words the caption, since a field visibly on an upstream block can't be
// reported as absent.
export interface FieldGap {
  key: string;
  optionalUpstream: boolean;
}

// One directed arrow between two elements (start → end). Either endpoint may be
// unattached (null) — those arrows carry no information and are ignored.
export interface FlowConnector {
  id: string;
  start: string | null;
  end: string | null;
}

// The match keys for a field list: "name : type", the optional marker left off.
// Callers pre-split required from optional, so the key itself is pure name+type
// identity on both sides of the comparison. Blank-named fields — an unfilled
// "+ Add field" row — carry no information and are dropped, so they never trip
// the check.
function fieldKeys(fields: Field[]): Set<string> {
  return new Set(
    fields.filter((field) => field.name.trim().length > 0).map((field) => fieldMatchKey(field)),
  );
}

// The gap behind every flagged connector: its id mapped to the fields its target
// requires and nothing feeding that target guarantees. A connector is absent
// from the map exactly when it isn't flagged, so the keys double as the flagged
// set.
//
// Each target is judged once, over its whole fan-in: the sources pointing into
// it pool their required fields, and the pool must cover every field the target
// requires, matched by name and type. Optionality cuts both ways — an optional
// target field (shown as "name : type?") need not be supplied by anyone, and an
// optional *source* field supplies nobody. A required supply anywhere in the
// fan-in still wins: one source carrying the key as required satisfies the
// target however many others carry it optionally.
//
// When the pool falls short, every arrow into that target is returned, including
// arrows whose own source supplies nothing: the shortfall is the target's, and
// there's no one arrow to pin it on. Every arrow into a target therefore reports
// the *same* gaps — the gap is the fan-in's, not any one arrow's. Arrows into a
// target that requires no fields are never flagged.
export function completenessGaps(
  elements: FieldedElement[],
  connectors: FlowConnector[],
): Map<string, FieldGap[]> {
  // Required keys do double duty: what a target demands, and the only thing a
  // source can be trusted to supply. Optional keys are a source's *soft* supply
  // — they satisfy nothing, and are tracked purely to word the caption.
  const requiredById = new Map(
    elements.map((element) => [
      element.id,
      fieldKeys(element.fields.filter((field) => !field.optional)),
    ]),
  );
  const optionalById = new Map(
    elements.map((element) => [
      element.id,
      fieldKeys(element.fields.filter((field) => field.optional)),
    ]),
  );

  // Group the attached arrows by target. An arrow with an unattached endpoint
  // carries no information, so it neither feeds a pool nor gets flagged.
  const incomingByTarget = new Map<string, { id: string; start: string }[]>();
  for (const { id, start, end } of connectors) {
    if (!start || !end) continue;
    const incoming = incomingByTarget.get(end);
    if (incoming) incoming.push({ id, start });
    else incomingByTarget.set(end, [{ id, start }]);
  }

  const gaps = new Map<string, FieldGap[]>();
  for (const [target, incoming] of incomingByTarget) {
    const required = requiredById.get(target);
    if (!required || required.size === 0) continue;

    const guaranteed = new Set<string>();
    const optionally = new Set<string>();
    for (const { start } of incoming) {
      for (const key of requiredById.get(start) ?? []) guaranteed.add(key);
      for (const key of optionalById.get(start) ?? []) optionally.add(key);
    }

    // In the target's own field order, so the caption reads like the block's
    // field list rather than an arbitrary permutation. The array is shared by
    // every arrow into this target — they all report the same gap — so callers
    // must treat it as read-only.
    const missing = [...required]
      .filter((key) => !guaranteed.has(key))
      .map((key) => ({ key, optionalUpstream: optionally.has(key) }));
    if (missing.length === 0) continue;
    for (const { id } of incoming) gaps.set(id, missing);
  }
  return gaps;
}

// The gap as display lines, one per missing field. A field nothing carries at
// all is the bare key, written as it is everywhere else ("total : number") — the
// red already says it's a problem, so it needs no lead-in. A field the fan-in
// *does* carry, but only optionally, is spelled out instead: it's visibly there
// on an upstream block, so listing it as absent would read as a lie. The
// sentence names what's actually wrong — an optional supply can't meet a
// required field. Shared by the render and the already-shows-it check so the two
// can't drift.
function gapLines(missing: FieldGap[]): string[] {
  return missing.map(({ key, optionalUpstream }) =>
    optionalUpstream ? `Field "${key}" is required` : key,
  );
}

// The gap rendered for the board: the missing fields in full, one per line — so
// a red arrow reads like the field list the target is short of. Kept here rather
// than in the feature so a non-Miro canvas words it identically.
//
// <br> rather than the <p> per line that renderStickyContent/fieldsBoxContent
// use: a caption is an inline label on a line, not a text block. Either parses
// back through htmlToLines, which splits on both.
export function gapCaption(missing: FieldGap[]): string {
  return gapLines(missing)
    .map((line) => escapeHtml(line))
    .join('<br>');
}

// Whether a caption already shows exactly this gap. Compares the *lines* parsed
// back out rather than the markup: the host re-wraps what it stores (Miro hands
// back its own HTML), so the rendered string is not comparable to itself — only
// the text is. Lets the poll leave a correct caption alone instead of rewriting
// it every tick.
export function captionShowsGap(caption: string[], missing: FieldGap[]): boolean {
  const lines = gapLines(missing);
  return caption.length === lines.length && caption.every((line, i) => line === lines[i]);
}
