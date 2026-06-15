// The Miro implementation of the Viewport port. The expansion math lives in
// the domain; this only reads and writes the visible rectangle.

import type { Rect } from '../../domain/viewport';
import type { Viewport } from '../../ports/viewport';

export class MiroViewport implements Viewport {
  async get(): Promise<Rect> {
    const viewport = await miro.board.viewport.get();
    return { x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height };
  }

  async set(rect: Rect): Promise<void> {
    await miro.board.viewport.set({ viewport: rect, animationDurationInMs: 200 });
  }
}
