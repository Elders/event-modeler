// Lane guides are transparent shapes rather than frames, so they never
// capture or cover the items modeled on top of them.

import { ensureVisible, viewportCenter } from '../miro/helpers';

const LANES = ['Screens', 'Commands & read models', 'Events'];

export async function insertSwimlanes() {
  const { x: cx, y: cy } = await viewportCenter();
  const width = 2400;
  const height = 500;
  const lanes: Awaited<ReturnType<typeof miro.board.createShape>>[] = [];
  for (let i = 0; i < LANES.length; i++) {
    lanes.push(
      await miro.board.createShape({
        shape: 'rectangle',
        x: cx,
        y: cy + (i - 1) * height,
        width,
        height,
        content: LANES[i],
        style: {
          fillColor: '#ffffff',
          fillOpacity: 0,
          borderColor: '#d0d0da',
          borderWidth: 1,
          color: '#9c9cac',
          fontSize: 24,
          textAlign: 'left',
          textAlignVertical: 'top',
        },
      }),
    );
  }
  await ensureVisible(lanes);
}
