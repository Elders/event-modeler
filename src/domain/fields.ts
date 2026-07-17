// Element fields: a named, typed piece of data carried by a modeled block. Pure
// domain — no platform reference — so it ports unchanged to any host. The two
// rendering helpers (sticky text + attached box) emit a small HTML subset that
// Miro's text-bearing items accept; the parsers read it back so an element's
// name survives round-trips and manual edits.

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'datetime'
  | 'uuid'
  | 'custom';

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  // The free-text type name when `type` is 'custom'.
  customType?: string;
  // An optional field renders with a "?" after its type and is never required
  // by the completeness check.
  optional?: boolean;
  // The upstream field name this one is fed by, when it differs: a read model's
  // "a" supplied by an event's "b" is `{ name: 'a', from: 'b' }`, rendered
  // "b > a : string" — source first, in the direction the data travels. Purely
  // an *intake* alias for the completeness check — it widens what satisfies this
  // field, and changes nothing about what the block supplies downstream (see
  // fieldMatchKey / fieldAliasKey). The type is not aliased: "b > a" means the
  // upstream b of this field's own type, so a type difference stays a real gap
  // rather than an implicit conversion.
  from?: string;
}

// The type options offered in the editor, in display order.
export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date-time' },
  { value: 'uuid', label: 'UUID' },
  { value: 'custom', label: 'Custom…' },
];

// A field cleaned for the document store. The per-field `id` is NOT persisted —
// it's only a React key / edit target, regenerated on read (see
// normalizeFieldRecords) — which keeps the registry small against the tight
// app-data budget. `customType` is kept only for the custom type (always a
// string, never `undefined`, which the Miro app-data store rejects). `from` is
// kept only when it names something: the editor's alias toggle turns it on as an
// empty string, which is a UI state, not an alias.
export function storableField(field: Field): Omit<Field, 'id'> {
  const base: Omit<Field, 'id'> = { name: field.name, type: field.type };
  if (field.type === 'custom') base.customType = field.customType ?? '';
  if (field.optional) base.optional = true;
  const from = fieldAlias(field);
  if (from) base.from = from;
  return base;
}

// A stable id for a field (React keys, edit/remove targeting).
export function newFieldId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// A fresh, empty field.
export function newField(): Field {
  return { id: newFieldId(), name: '', type: 'string' };
}

// The arrow between the upstream name a field is fed by and the field's own
// name: the display line is "from > name : type", source first, pointing the way
// the data travels. One ASCII character, because a sticky's text is the store
// and is edited directly on the board — the rendered form is the form people
// have to type. The panel's toggle button shows "→" instead: it's clicked, never
// typed, so the glyph costs nothing there and reads better.
//
// Nothing parses "←", "<-" or "<". None was ever deployed, so no board carries
// them and there is no legacy to support.
//
// ">" is also the safer of the two brackets here: stripHtml's tag regex only
// starts matching at a "<", so a stray ">" on a line can never be mistaken for
// the tail of a tag.
const ALIAS_ARROW = '>';

// The two separators on a display line — "from > name : type" — and so the two
// things a *name* cannot contain. The parsers split on both, so a field named
// "a:b" renders as "a:b : string" and reads back as the field "a" of a custom
// type called "b : string"; one named "a>b" reads back as the field "b" fed by
// "a". Either way the name is silently gone.
//
// So neither is a valid name character, and both are stripped at every door a
// name can come in by: the panel's name and "fed by" inputs, and the generator's
// trust boundary. Neither can arrive from the board — parseFieldLine splits the
// name off at them, so what it yields never contains one.
//
// Type labels are deliberately unaffected: everything past the first colon is
// already the label, so a custom type may contain colons — or an arrow — and
// round-trips fine.
export function cleanFieldName(name: string): string {
  return name.replace(/[:>]/g, '');
}

// The type as shown on the board: the custom name when custom, 'UUID' upcased,
// the plain type word otherwise.
export function fieldTypeLabel(field: Field): string {
  if (field.type === 'custom') {
    const custom = field.customType?.trim();
    return custom && custom.length > 0 ? custom : 'custom';
  }
  if (field.type === 'uuid') return 'UUID';
  return field.type;
}

// The name+type identity of a field, ignoring optionality: "name : type". The
// completeness check matches fields on this key, but reads optionality
// separately on both sides — an optional field neither has to be supplied nor
// supplies anything.
//
// Deliberately blind to `from`: an alias is what this field *accepts*, never
// what it is. A read model whose "a" is fed by an event's "b" still supplies
// "a : string" to everything downstream of it — aliases don't propagate, or a
// rename declared once would follow the data across the whole board.
export function fieldMatchKey(field: Field): string {
  return `${field.name} : ${fieldTypeLabel(field)}`;
}

// The alias a field declares, or '' when it declares none. Trimmed, so the
// editor's "toggled on but not yet typed into" state reads as no alias.
export function fieldAlias(field: Field): string {
  return field.from?.trim() ?? '';
}

// The *other* key that satisfies this field, when it names an upstream field of
// a different name: "from : type", or null when there's no alias. The type is
// the field's own — "b > a" means the upstream b of *this field's* type, so a
// required "a : string" fed by "b" is satisfied by an upstream "b : string" and
// still not by "b : number". An alias bridges a naming difference, nothing else.
export function fieldAliasKey(field: Field): string | null {
  const from = fieldAlias(field);
  return from ? `${from} : ${fieldTypeLabel(field)}` : null;
}

// One field as a single display line: "name : type" — or "from > name : type"
// when it's fed by a differently-named upstream field — with a "?" after the
// type when the field is optional.
export function formatField(field: Field): string {
  const from = fieldAlias(field);
  const name = from ? `${from} ${ALIAS_ARROW} ${field.name}` : field.name;
  const line = `${name} : ${fieldTypeLabel(field)}`;
  return field.optional ? `${line}?` : line;
}

// The fields as the board will read them back once these are rendered onto it —
// a round trip through the display format.
//
// Rendering is lossy in places: a custom type with no name shows as "custom" and
// parses back as the custom type *named* "custom", and an empty name loses its
// leading space. So a caller that records what it wrote (rather than what it
// later read) must record this, not the raw input — otherwise the note disagrees
// with the very display it produced. Comparing fields is only meaningful between
// two values that have both been through here, or both come off the board.
export function asDisplayed(fields: Field[]): Field[] {
  return linesToFields(fields.map(formatField), []);
}

// Whether two field lists carry the same fields in the same order — name, type,
// custom type name, alias, and optionality all equal. Ids are ignored: they're
// per-session edit keys, not identity. The alias is compared through fieldAlias
// so an untyped-into '' matches the absent one it renders as. Used to decide
// whether a board-side display and the registry actually disagree before
// adopting or rewriting anything.
export function sameFields(a: Field[], b: Field[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (field, index) =>
        field.name === b[index].name &&
        field.type === b[index].type &&
        (field.customType ?? '') === (b[index].customType ?? '') &&
        fieldAlias(field) === fieldAlias(b[index]) &&
        (field.optional ?? false) === (b[index].optional ?? false),
    )
  );
}

// The sticky's full text: the block name on the first line, then — when there
// are fields — a blank line and one paragraph per field. There is no delimiter;
// the name is simply the first line, so a manual rename just edits it. Each part
// is HTML-escaped, and the blank line (&nbsp;) decodes to empty so the parsers
// skip over it.
export function renderStickyContent(name: string, fields: Field[]): string {
  const head = `<p>${escapeHtml(name)}</p>`;
  if (fields.length === 0) return head;
  const lines = fields.map((field) => `<p>${escapeHtml(formatField(field))}</p>`).join('');
  return `${head}<p>&nbsp;</p>${lines}`;
}

// The block name recovered from a sticky's text: the first paragraph. Uses the
// position-preserving split (not htmlToLines) so an *empty* name stays the name
// instead of letting the first field line slide into its place.
export function extractName(content: string | null): string {
  return htmlToParagraphs(content)[0] ?? '';
}

// The field lines from a sticky's text: every non-empty paragraph after the
// name (the blank separator and any stray blank lines are dropped here).
export function extractFieldLines(content: string | null): string[] {
  return htmlToParagraphs(content).slice(1).filter((line) => line.length > 0);
}

// Parses a sticky's text back into fields — the inbound direction of editing,
// so a user can type "name : type" lines directly on the block. The first
// paragraph is the name (possibly empty); each following non-empty line is one
// field. Existing ids are reused by name so reconciling doesn't churn React keys
// or rewrite unchanged rows.
export function parseStickyFields(content: string | null, existing: Field[] = []): Field[] {
  const lines = htmlToParagraphs(content).slice(1).filter((line) => line.length > 0);
  return linesToFields(lines, existing);
}

// Parses the attached box (screens/automations) back into fields — the inbound
// direction for box-mode blocks, mirroring parseStickyFields for stickies. The
// box holds only field lines (no name line), so every non-empty paragraph is a
// field. Lets a box-mode block recover its fields from what's drawn on the board
// when its registry record was lost.
export function parseBoxFields(content: string | null, existing: Field[] = []): Field[] {
  return linesToFields(htmlToLines(content), existing);
}

// Maps display lines to fields, reusing an existing field's id when the name
// still matches so a reconcile doesn't churn React keys or rewrite unchanged
// rows. Shared by the sticky and box parsers.
function linesToFields(lines: string[], existing: Field[]): Field[] {
  const pool = [...existing];
  return lines.map((line) => {
    const field = parseFieldLine(line);
    const match = pool.findIndex((candidate) => candidate.name === field.name);
    if (match >= 0) {
      field.id = pool[match].id;
      pool.splice(match, 1);
    }
    return field;
  });
}

function parseFieldLine(line: string): Field {
  // Split on the first colon: the name half is everything before it, the type
  // label everything after. This keeps an empty name empty — a line like
  // ": string" that lost its leading space when the HTML round-trip trimmed it —
  // and still leaves any colon inside a custom type label on the label side.
  const colon = line.indexOf(':');
  if (colon < 0) return { id: newFieldId(), ...splitAlias(line), type: 'string' };
  // A trailing "?" is the optional marker, not part of the type label — so a
  // custom type whose own name ends in "?" reads back as that type, optional.
  let label = line.slice(colon + 1).trim();
  const optional = label.endsWith('?');
  if (optional) label = label.slice(0, -1).trim();
  const field: Field = {
    id: newFieldId(),
    ...splitAlias(line.slice(0, colon)),
    ...typeFromLabel(label),
  };
  if (optional) field.optional = true;
  return field;
}

// The name half of a display line, split at the alias arrow: "b > a" is the
// field "a" fed by "b" — the source is on the left, the field's own name on the
// right. Split at the *first* arrow, mirroring the colon, so the leftmost
// separator always wins and a second one lands in the *name* — where it is then
// stripped by the name cleaning, exactly as a stray colon is.
//
// `from` is left off entirely when there's nothing before the arrow, so a
// stray "> a" parses back as the plain field "a" rather than one carrying an
// empty alias. A half-typed "b >" is the mirror case and yields the alias with
// an empty name, which every caller already drops as nameless.
function splitAlias(half: string): { name: string; from?: string } {
  const arrow = half.indexOf(ALIAS_ARROW);
  if (arrow < 0) return { name: half.trim() };
  const from = half.slice(0, arrow).trim();
  const name = half.slice(arrow + ALIAS_ARROW.length).trim();
  return from ? { name, from } : { name };
}

// Maps a displayed type label back to a FieldType; an unrecognized label
// becomes a custom type carrying the label verbatim.
function typeFromLabel(label: string): { type: FieldType; customType?: string } {
  const known: FieldType[] = ['string', 'number', 'boolean', 'date', 'time', 'datetime', 'uuid'];
  const match = known.find((type) => type === label.toLowerCase());
  return match ? { type: match } : { type: 'custom', customType: label };
}

// The attached box (screens/automations) holds only the field lines.
export function fieldsBoxContent(fields: Field[]): string {
  return fields.map((field) => `<p>${escapeHtml(formatField(field))}</p>`).join('');
}

// Box geometry, derived from the number of field lines.
export const FIELDS_BOX_GAP = 16; // vertical space between the element and its box
export const FIELDS_BOX_MIN_WIDTH = 220;
export const FIELDS_BOX_FONT = 18;
const FIELDS_BOX_LINE = 26; // px per field line
const FIELDS_BOX_PADDING = 12; // vertical padding inside the box

export function fieldsBoxHeight(fieldCount: number): number {
  return FIELDS_BOX_PADDING * 2 + Math.max(1, fieldCount) * FIELDS_BOX_LINE;
}

// Splits an HTML fragment into display lines (one per <p> or <br>), tags
// stripped and entities decoded; empty lines are dropped.
export function htmlToLines(content: string | null): string[] {
  if (!content) return [];
  return content
    .split(/<\/p>|<br\s*\/?>/i)
    .map((chunk) => stripHtml(chunk))
    .filter((line) => line.length > 0);
}

// Like htmlToLines but keeps empty paragraphs, so the *position* of the name
// line survives. The sticky format is "name, [blank separator,] fields" and the
// name may be empty; if empties were dropped, an empty name would let the first
// field line slide into the name slot and render a stray ": string". Callers
// take paragraph[0] as the name and filter empties out of the remaining lines.
export function htmlToParagraphs(content: string | null): string[] {
  if (!content) return [];
  return content.split(/<\/p>|<br\s*\/?>/i).map((chunk) => stripHtml(chunk));
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(value: string): string {
  // &amp; is decoded last so an escaped "&lt;" never collapses past one level.
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
