// The Viewport port: read the visible rectangle and set it. The expansion math
// (never zoom in) lives in the domain; the adapter only reads and writes.

import type { Rect } from '../domain/viewport';

export interface Viewport {
  get(): Promise<Rect>;
  set(rect: Rect): Promise<void>;
}
