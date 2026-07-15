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

import { fieldMatchKey, type Field } from './fields';

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

// The ids of the connectors that should be flagged as incomplete. Each target
// is judged once, over its whole fan-in: the sources pointing into it pool
// their fields, and the pool must cover every field the target declares,
// matched by name and type. Optional target fields (shown as "name : type?")
// are exempt — they're optional, so nothing has to supply them. When the pool
// falls short, every arrow into that target is returned, including arrows whose
// own source supplies nothing: the shortfall is the target's, and there's no
// one arrow to pin it on. Arrows into a target that carries no required fields
// are never flagged.
export function incompleteConnectors(
  elements: FieldedElement[],
  connectors: FlowConnector[],
): Set<string> {
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

  const flagged = new Set<string>();
  for (const [target, incoming] of incomingByTarget) {
    const required = requiredById.get(target);
    if (!required || required.size === 0) continue;

    const pooled = new Set<string>();
    for (const { start } of incoming) {
      for (const key of providedById.get(start) ?? []) pooled.add(key);
    }

    const complete = [...required].every((key) => pooled.has(key));
    if (!complete) for (const { id } of incoming) flagged.add(id);
  }
  return flagged;
}
