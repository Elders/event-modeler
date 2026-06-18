// The registries the tool keeps alongside the document: which containers are
// slices and specifications (with their chrome and size), how copies map back
// to their originals, and which elements carry fields. Pure data shapes plus
// normalization — the Store port decides where the bytes live.

import type { Field } from './fields';
import type { BlockType } from './vocabulary';

// One registry record per tool-managed container (spec or slice): the
// container id, the ids of its chrome children (labels, "+" buttons), per-zone
// heights for specs, and the last known size for resize detection by polling.
export type FrameRecord = {
  frame: string;
  labels: string[];
  zones?: Record<string, number>;
  width?: number;
  height?: number;
};

// A linked copy: the original element, the copy placed in a spec zone, and the
// spec it belongs to (so deleting a spec can take its copies with it).
export type SpecLink = { source: string; copy: string; spec?: string };

// One record per field-bearing element: which element it is, its block type
// (drives sticky-text vs attached-box rendering), the field definitions, and —
// for the box display — the id of the attached box (null for in-text stickies).
export type FieldRecord = {
  element: string;
  type: BlockType;
  fields: Field[];
  card?: string | null;
};

export const SPECS_KEY = 'em-specs';
export const SLICES_KEY = 'em-slices';
export const LINKS_KEY = 'em-links';
export const FIELDS_KEY = 'em-fields';

// Earlier versions stored plain container-id strings; normalize them to
// records so data written by older versions stays readable.
export function normalizeRecords(raw: unknown): FrameRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      typeof entry === 'string' ? { frame: entry, labels: [] } : (entry as FrameRecord),
    )
    .filter((record) => record && typeof record.frame === 'string');
}

// Field records have their own shape (keyed by element, not frame), so they get
// their own guard rather than reusing the frame normalizer.
export function normalizeFieldRecords(raw: unknown): FieldRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is FieldRecord =>
      !!entry &&
      typeof (entry as FieldRecord).element === 'string' &&
      Array.isArray((entry as FieldRecord).fields),
  );
}
