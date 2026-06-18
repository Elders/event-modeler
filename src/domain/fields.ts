// Element fields: a named, typed piece of data carried by a modeled block. Pure
// domain — no platform reference — so it ports unchanged to any host. The two
// rendering helpers (sticky text + attached box) emit a small HTML subset that
// Miro's text-bearing items accept; the parsers read it back so an element's
// name survives round-trips and manual edits.

export type FieldType = 'string' | 'number' | 'date' | 'time' | 'datetime' | 'uuid' | 'custom';

export interface Field {
  id: string;
  name: string;
  type: FieldType;
  // The free-text type name when `type` is 'custom'.
  customType?: string;
}

// The type options offered in the editor, in display order.
export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date-time' },
  { value: 'uuid', label: 'UUID' },
  { value: 'custom', label: 'Custom…' },
];

// A field cleaned for the document store: `customType` is kept only for the
// custom type (always as a string), never left `undefined`. The Miro app-data
// store rejects `undefined` members, so this runs before every write.
export function storableField(field: Field): Field {
  const base = { id: field.id, name: field.name, type: field.type };
  return field.type === 'custom' ? { ...base, customType: field.customType ?? '' } : base;
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

// One field as a single display line: "name : type".
export function formatField(field: Field): string {
  return `${field.name} : ${fieldTypeLabel(field)}`;
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
  // Split on the first colon: the name is everything before it, the type label
  // everything after. This keeps an empty name empty — a line like ": string"
  // that lost its leading space when the HTML round-trip trimmed it — and still
  // leaves any colon inside a custom type label on the label side.
  const colon = line.indexOf(':');
  if (colon < 0) return { id: newFieldId(), name: line.trim(), type: 'string' };
  const name = line.slice(0, colon).trim();
  return { id: newFieldId(), name, ...typeFromLabel(line.slice(colon + 1).trim()) };
}

// Maps a displayed type label back to a FieldType; an unrecognized label
// becomes a custom type carrying the label verbatim.
function typeFromLabel(label: string): { type: FieldType; customType?: string } {
  const known: FieldType[] = ['string', 'number', 'date', 'time', 'datetime', 'uuid'];
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
export const FIELDS_BOX_FONT = 14;
const FIELDS_BOX_LINE = 22; // px per field line
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

function escapeHtml(value: string): string {
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
