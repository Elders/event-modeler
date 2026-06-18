// Information-completeness check: a pure data-flow rule over the model. An
// element that carries fields draws them from the elements pointing into it,
// and each incoming arrow is validated on its own: the source must supply every
// field the target declares, matched by name and type. An arrow whose source is
// missing any of the target's fields — a differing type counts as missing — is
// flagged, regardless of what other arrows into the same target provide. No
// platform here: just the model graph and its fields, so it ports unchanged to
// any canvas.

import { formatField, type Field } from './fields';

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

// The match key for a field: "name : type" (the same canonical form used for
// field equality elsewhere). Blank-named fields — an unfilled "+ Add field"
// row — carry no information and are dropped, so they never trip the check.
function fieldKeys(fields: Field[]): Set<string> {
  return new Set(
    fields.filter((field) => field.name.trim().length > 0).map((field) => formatField(field)),
  );
}

// The ids of the connectors that should be flagged as incomplete. Each arrow is
// judged on its own: the source must carry every field the target declares,
// matched by name and type. An arrow whose source lacks any of the target's
// fields is returned — independently of what other arrows into the same target
// supply. Arrows into a target that carries no fields are never flagged.
export function incompleteConnectors(
  elements: FieldedElement[],
  connectors: FlowConnector[],
): Set<string> {
  const keysById = new Map(elements.map((element) => [element.id, fieldKeys(element.fields)]));
  const none: Set<string> = new Set();

  const flagged = new Set<string>();
  for (const connector of connectors) {
    if (!connector.start || !connector.end) continue;
    const required = keysById.get(connector.end);
    if (!required || required.size === 0) continue;
    const provided = keysById.get(connector.start) ?? none;
    const complete = [...required].every((key) => provided.has(key));
    if (!complete) flagged.add(connector.id);
  }
  return flagged;
}
