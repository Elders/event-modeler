// Board app data: the persistence layer for frame registries. Frames cannot
// carry item metadata, so specs and slices are tracked here instead.

export async function readAppData<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await miro.board.getAppData(key);
    return (value ?? fallback) as T;
  } catch (error) {
    console.warn(`Could not read app data "${key}"`, error);
    return fallback;
  }
}

export async function writeAppData(key: string, value: unknown) {
  try {
    await miro.board.setAppData(key, value as Parameters<typeof miro.board.setAppData>[1]);
  } catch (error) {
    console.warn(`Could not write app data "${key}"`, error);
  }
}

// One registry record per app-managed frame (spec or slice): the frame id,
// the ids of its chrome children (labels, + buttons), per-zone heights for
// specs, and the last known size for resize detection by polling.
export type FrameRecord = {
  frame: string;
  labels: string[];
  zones?: Record<string, number>;
  width?: number;
  height?: number;
};

// Earlier versions stored plain frame-id strings; normalize them to records.
export async function readRecordsFor(key: string): Promise<FrameRecord[]> {
  const raw = await readAppData<unknown>(key, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      typeof entry === 'string' ? { frame: entry, labels: [] } : (entry as FrameRecord),
    )
    .filter((record) => record && typeof record.frame === 'string');
}
