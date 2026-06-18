// A lane guide: a transparent rectangle rather than a container, so it never
// captures or covers the elements modeled on top of it. Placed one at a time —
// stack several to build the conventional screens / commands / events rows. The
// tool does not track lanes after creation.

import { services } from '../services';
import { ensureVisible, viewportCenter } from './helpers';

const LANE_WIDTH = 2400;
const LANE_HEIGHT = 500;

export async function insertSwimlane(at?: { x: number; y: number }): Promise<void> {
  const { canvas } = services();
  const { x, y } = at ?? (await viewportCenter());
  const lane = await canvas.createShape({
    shape: 'rectangle',
    x,
    y,
    width: LANE_WIDTH,
    height: LANE_HEIGHT,
    content: 'Swimlane',
    fill: '#ffffff',
    fillOpacity: 0,
    borderColor: '#d0d0da',
    borderWidth: 1,
    textColor: '#9c9cac',
    fontSize: 24,
    textAlign: 'left',
    textAlignVertical: 'top',
  });
  await ensureVisible([lane]);
}
