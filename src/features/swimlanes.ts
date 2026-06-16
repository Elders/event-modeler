// Lane guides are transparent shapes rather than containers, so they never
// capture or cover the elements modeled on top of them. The tool does not
// track them after creation.

import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { ensureVisible, viewportCenter } from './helpers';

const LANES = ['Screens', 'Commands & read models', 'Events'];

export async function insertSwimlanes(at?: { x: number; y: number }): Promise<void> {
  const { canvas } = services();
  const { x: cx, y: cy } = at ?? (await viewportCenter());
  const width = 2400;
  const height = 500;
  const lanes: CanvasElement[] = [];
  for (let i = 0; i < LANES.length; i++) {
    lanes.push(
      await canvas.createShape({
        shape: 'rectangle',
        x: cx,
        y: cy + (i - 1) * height,
        width,
        height,
        content: LANES[i],
        fill: '#ffffff',
        fillOpacity: 0,
        borderColor: '#d0d0da',
        borderWidth: 1,
        textColor: '#9c9cac',
        fontSize: 24,
        textAlign: 'left',
        textAlignVertical: 'top',
      }),
    );
  }
  await ensureVisible(lanes);
}
