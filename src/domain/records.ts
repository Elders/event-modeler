// The registries the tool keeps alongside the document: which containers are
// slices and specifications (with their chrome and size), and how copies map
// back to their originals. Pure data shapes plus normalization — the Store
// port decides where the bytes live.

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

export const SPECS_KEY = 'em-specs';
export const SLICES_KEY = 'em-slices';
export const LINKS_KEY = 'em-links';

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
