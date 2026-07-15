// Information-completeness check: a pure data-flow rule over the model. An
// element that carries fields draws them from the elements pointing into it,
// and the check is judged per *target*: everything pointing into a target pools
// its fields, and the target is satisfied when that pool covers every field the
// target declares, matched by name and type (a differing type counts as
// missing). A read model hydrated by several events is the motivating case —
// each event carries its own slice of the whole, and no single one has to carry
// all of it. When the pool falls short, every arrow into that target is flagged:
// the gap belongs to the target's fan-in, not to any one arrow, and closing it
// on any one source clears them all. No platform here: just the model graph and
// its fields, so it ports unchanged to any canvas.

import { escapeHtml, fieldMatchKey, type Field } from './fields';

// One field-bearing element: its id and the fields it declares.
export interface FieldedElement {
  id: string;
  fields: Field[];
}

// One directed arrow between two elements (start → end). Either endpoint may be
// unattached (null) — those arrows carry no information and are ignored.
export interface FlowConnector {
  id: string;
  start: string | null;
  end: string | null;
}

// The match keys for a field list: "name : type", optionality ignored (so an
// optional source field still supplies the name+type). Blank-named fields — an
// unfilled "+ Add field" row — carry no information and are dropped, so they
// never trip the check.
function fieldKeys(fields: Field[]): Set<string> {
  return new Set(
    fields.filter((field) => field.name.trim().length > 0).map((field) => fieldMatchKey(field)),
  );
}

// The gap behind every flagged connector: its id mapped to the field keys its
// target needs and nothing feeding that target supplies. A connector is absent
// from the map exactly when it isn't flagged, so the keys double as the flagged
// set.
//
// Each target is judged once, over its whole fan-in: the sources pointing into
// it pool their fields, and the pool must cover every field the target declares,
// matched by name and type. Optional target fields (shown as "name : type?")
// are exempt — they're optional, so nothing has to supply them. When the pool
// falls short, every arrow into that target is returned, including arrows whose
// own source supplies nothing: the shortfall is the target's, and there's no one
// arrow to pin it on. Every arrow into a target therefore reports the *same*
// missing keys — the gap is the fan-in's, not any one arrow's. Arrows into a
// target that carries no required fields are never flagged.
export function completenessGaps(
  elements: FieldedElement[],
  connectors: FlowConnector[],
): Map<string, string[]> {
  const providedById = new Map(elements.map((element) => [element.id, fieldKeys(element.fields)]));
  const requiredById = new Map(
    elements.map((element) => [
      element.id,
      fieldKeys(element.fields.filter((field) => !field.optional)),
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

  const gaps = new Map<string, string[]>();
  for (const [target, incoming] of incomingByTarget) {
    const required = requiredById.get(target);
    if (!required || required.size === 0) continue;

    const pooled = new Set<string>();
    for (const { start } of incoming) {
      for (const key of providedById.get(start) ?? []) pooled.add(key);
    }

    // In the target's own field order, so the caption reads like the block's
    // field list rather than an arbitrary permutation. The array is shared by
    // every arrow into this target — they all report the same gap — so callers
    // must treat it as read-only.
    const missing = [...required].filter((key) => !pooled.has(key));
    if (missing.length === 0) continue;
    for (const { id } of incoming) gaps.set(id, missing);
  }
  return gaps;
}

// The gap rendered for the board: the missing keys as they're written
// everywhere else ("name : type"), in full, one per line — so a red arrow reads
// like the field list the target is short of. Kept here rather than in the
// feature so a non-Miro canvas words it identically.
//
// <br> rather than the <p> per line that renderStickyContent/fieldsBoxContent
// use: a caption is an inline label on a line, not a text block. Either parses
// back through htmlToLines, which splits on both.
export function gapCaption(missing: string[]): string {
  return missing.map((key) => escapeHtml(key)).join('<br>');
}

// Whether a caption already shows exactly this gap. Compares the *lines* parsed
// back out rather than the markup: the host re-wraps what it stores (Miro hands
// back its own HTML), so the rendered string is not comparable to itself — only
// the text is. Lets the poll leave a correct caption alone instead of rewriting
// it every tick.
export function captionShowsGap(caption: string[], missing: string[]): boolean {
  return caption.length === missing.length && caption.every((line, i) => line === missing[i]);
}
