// The Miro implementation of the Viewport port. The expansion math lives in
// the domain; this only reads and writes the visible rectangle — through the
// rate-limit gate like every other SDK call, so viewport moves are paced,
// counted by the credit meter, and stand down with everything else when the
// board is refusing work.

import type { Rect } from '../../domain/viewport';
import type { Viewport } from '../../ports/viewport';
import { withRateLimit } from './rateLimit';

export class MiroViewport implements Viewport {
  async get(): Promise<Rect> {
    const viewport = await withRateLimit('viewport', () => miro.board.viewport.get());
    return { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height };
  }

  async set(rect: Rect): Promise<void> {
    await withRateLimit('viewport', () =>
      miro.board.viewport.set({ viewport: rect, animationDurationInMs: 200 }),
    );
  }
}
