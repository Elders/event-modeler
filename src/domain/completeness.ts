// Information-completeness check: a pure data-flow rule over the model. An
// element that carries fields draws them from the elements pointing into it,
// and the check runs in two passes over each target's fan-in.
//
// First, the *target* is judged as a whole: everything pointing into it pools
// its fields, and the target is satisfied when that pool covers every field the
// target declares, matched by name — type plays no part in it, so a field is
// satisfied by an upstream field of the same name whatever type either side
// declares (see fieldMatchKey). Only a source's *required* fields supply — a
// field that may be absent can't guarantee one that must be present. A target
// may also declare that one of its fields is fed by one or more upstream
// fields of a different *name* ("b > a", or "b, c > a" for more than one),
// which widens what satisfies that one field and nothing else — see
// fieldAliasNames. Any one of several declared names is enough; they're
// alternatives for the same datum, not all required from the same arrow — a
// read model whose "a" arrives as "b" from one event and "c" from another is
// still fully satisfied by the two of them together. A read model hydrated by
// several events is the motivating case — each event carries its own slice of
// the whole, and no single one has to carry all of it. When the pool falls
// short, every arrow into that target is flagged: the gap belongs to the
// target's fan-in, not to any one arrow, and closing it on any one source clears
// them all.
//
// A field may also be marked *generated*: synthesized by the block itself at
// runtime (a command handler assigning an id, say) rather than sourced from an
// incoming block. It's excluded from what its own block's incoming arrows must
// supply — nothing upstream is ever expected to carry it — but it still
// counts as a guaranteed supply *from* that block to whatever it feeds
// downstream, exactly like any other required field: once generated, it's as
// real and present as anything sourced (see requiredFieldsById vs.
// suppliedFieldsById).
//
// Second, once the target *is* covered by its fan-in, each arrow is judged on
// its own: a source that supplies none of what the target needs — not even
// optionally — is flagged as a no-contribution link, even though the target it
// feeds is fine. This catches a link that's wired up but never actually
// carries any of the target's fields, without reviving the all-or-nothing
// per-arrow rule that was tried and reverted (see DECISIONS.md): a source only
// has to supply *one* field the target needs to clear this bar, so the
// idiomatic multi-event hydration pattern above stays untouched — this only
// catches an arrow that carries none of it. No platform here: just the model
// graph and its fields, so it ports unchanged to any canvas.

import { escapeHtml, fieldAliasNames, fieldMatchKey, formatField, type Field } from './fields';

// One field-bearing element: its id and the fields it declares.
export interface FieldedElement {
  id: string;
  fields: Field[];
}

// One gap behind a flagged arrow, either:
//
// - `'missing'`: a field the *target* requires that nothing feeding it
//   guarantees, plus whether the fan-in carries it but only as an *optional*
//   field. Both are gaps — the distinction only words the caption, since a
//   field visibly on an upstream block can't be reported as absent. `key` is
//   the field as the target displays it, so an aliased field reports
//   "b > a : string": the arrow names the upstream field that's actually
//   missing, rather than the local name nothing was ever going to supply. For
//   a field with no alias it's just the field's own "name : type" display —
//   type still shows here even though it plays no part in matching (see
//   fieldMatchKey).
// - `'noContribution'`: the target *is* covered by its fan-in, but this
//   arrow's own source supplies none of what the target needs — the link
//   itself is the thing flagged, not the target.
export type FieldGap =
  | { kind: 'missing'; key: string; optionalUpstream: boolean }
  | { kind: 'noContribution' };

// Shared by every no-contribution arrow — the gap carries no per-field data,
// so one array does for all of them, same as the missing-field list is shared
// across a whole flagged fan-in.
const NO_CONTRIBUTION: FieldGap[] = [{ kind: 'noContribution' }];

// One directed arrow between two elements (start → end). Either endpoint may be
// unattached (null) — those arrows carry no information and are ignored.
export interface FlowConnector {
  id: string;
  start: string | null;
  end: string | null;
}

// The fields that carry information. A blank-named field — an unfilled "+ Add
// field" row — carries none and is dropped, so it never trips the check.
function namedFields(fields: Field[]): Field[] {
  return fields.filter((field) => field.name.trim().length > 0);
}

// The match keys for a field list: just the name (see fieldMatchKey) — type
// and the optional marker both left off. Callers pre-split required from
// optional, so the key itself is pure name identity on both sides of the
// comparison.
//
// Aliases are absent here by construction (fieldMatchKey ignores them): this is
// the *supply* side, and what a block declares it accepts under another name has
// no bearing on what it hands downstream.
function fieldKeys(fields: Field[]): Set<string> {
  return new Set(namedFields(fields).map((field) => fieldMatchKey(field)));
}

// The gap behind every flagged connector: its id mapped either to the fields
// its target requires and nothing feeding that target guarantees, or — once
// the target itself is covered — a lone `noContribution` marking an arrow
// whose own source isn't part of what covers it. A connector is absent from
// the map exactly when it isn't flagged, so the keys double as the flagged
// set.
//
// Each target is judged once, over its whole fan-in: the sources pointing into
// it pool their required fields, and the pool must cover every field the target
// requires, matched by name only — type is not compared (see fieldMatchKey).
// Optionality cuts both ways — an optional target field (shown as
// "name : type?") need not be supplied by anyone, and an optional *source*
// field supplies nobody. A required supply anywhere in the fan-in still wins:
// one source carrying the key as required satisfies the target however many
// others carry it optionally.
//
// When the pool falls short, every arrow into that target is returned, including
// arrows whose own source supplies nothing: the shortfall is the target's, and
// there's no one arrow to pin it on. Every arrow into a target therefore reports
// the *same* gaps — the gap is the fan-in's, not any one arrow's. Arrows into a
// target that requires no fields are never flagged.
//
// When the pool does cover the target, each arrow is then judged on its own: a
// source that supplies none of the target's required fields — not even
// optionally, which counts as no contribution the same way it counts for
// nothing in the pool above — is flagged with `noContribution`. Supplying just
// *one* field the target needs clears the bar, so a source carrying its own
// slice of a multi-event hydration is never caught by this; it only catches an
// arrow that carries none of the target's fields at all.
export function completenessGaps(
  elements: FieldedElement[],
  connectors: FlowConnector[],
): Map<string, FieldGap[]> {
  // A target is judged from its required *fields*, not their keys: an alias is
  // per-field, so what satisfies each one has to be asked of the field itself.
  // Generated fields are excluded here — synthesized by the block itself at
  // runtime (a command handler assigning an id, say), never expected from an
  // incoming arrow — even though the very same field still counts as a
  // guaranteed supply *from* that block, like any other required one (see
  // suppliedFieldsById next).
  const requiredFieldsById = new Map(
    elements.map((element) => [
      element.id,
      namedFields(element.fields.filter((f) => !f.optional && !f.generated)),
    ]),
  );
  // What an element supplies downstream, guaranteed: every non-optional field
  // — generated fields count here even though requiredFieldsById excludes
  // them, since once generated a field is as real and present to whatever
  // consumes it as one that arrived from upstream. Only *optional* fields are
  // a soft, unguaranteed supply — tracked separately, purely to word the
  // caption.
  const suppliedFieldsById = new Map(
    elements.map((element) => [element.id, namedFields(element.fields.filter((f) => !f.optional))]),
  );
  const suppliedById = new Map(
    [...suppliedFieldsById].map(([id, fields]) => [id, new Set(fields.map(fieldMatchKey))] as const),
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
    const required = requiredFieldsById.get(target);
    if (!required || required.length === 0) continue;

    const guaranteed = new Set<string>();
    const optionally = new Set<string>();
    for (const { start } of incoming) {
      for (const key of suppliedById.get(start) ?? []) guaranteed.add(key);
      for (const key of optionalById.get(start) ?? []) optionally.add(key);
    }

    // In the target's own field order, so the caption reads like the block's
    // field list rather than an arbitrary permutation. The array is shared by
    // every arrow into this target — they all report the same gap — so callers
    // must treat it as read-only.
    const missing: FieldGap[] = [];
    const judged = new Set<string>();
    for (const field of required) {
      const own = fieldMatchKey(field);
      if (judged.has(own)) continue; // the same field declared twice: judge it once
      judged.add(own);
      // Any of its names satisfies it: its own, or any one of the upstream ones
      // it declares it's fed by. Optionality is then read against whichever
      // name could have supplied it — a gap the fan-in covers only optionally
      // is still a gap, but it's the "you have it, but it may be absent" one,
      // and that stays true when the field it has is one of the aliases.
      const aliases = fieldAliasNames(field);
      if (guaranteed.has(own) || aliases.some((key) => guaranteed.has(key))) continue;
      missing.push({
        kind: 'missing',
        key: formatField(field),
        optionalUpstream: optionally.has(own) || aliases.some((key) => optionally.has(key)),
      });
    }
    if (missing.length > 0) {
      for (const { id } of incoming) gaps.set(id, missing);
      continue;
    }

    // The fan-in as a whole covers the target — but a source that supplies
    // none of what the target needs isn't pulling its weight just because some
    // other arrow happens to. Judged against the source's own required set
    // only: an optional match doesn't clear the bar here either, same as it
    // never satisfied the pool above.
    for (const { id, start } of incoming) {
      const supplied = suppliedById.get(start);
      const contributes =
        !!supplied &&
        required.some((field) => {
          const own = fieldMatchKey(field);
          const aliases = fieldAliasNames(field);
          return supplied.has(own) || aliases.some((key) => supplied.has(key));
        });
      if (!contributes) gaps.set(id, NO_CONTRIBUTION);
    }
  }
  return gaps;
}

// The gap as display lines, one per missing field. A field nothing carries at
// all is the bare key, written as it is everywhere else ("total : number") — the
// red already says it's a problem, so it needs no lead-in. A field the fan-in
// *does* carry, but only optionally, is spelled out instead: it's visibly there
// on an upstream block, so listing it as absent would read as a lie. The
// sentence names what's actually wrong — an optional supply can't meet a
// required field. A no-contribution gap gets its own sentence — there's no
// field to name, since the target isn't short of anything; the arrow itself is
// what's flagged. Shared by the render and the already-shows-it check so the
// two can't drift.
function gapLines(missing: FieldGap[]): string[] {
  return missing.map((gap) =>
    gap.kind === 'noContribution'
      ? 'Supplies none of the required fields'
      : gap.optionalUpstream
        ? `Field "${gap.key}" is required`
        : gap.key,
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
