// Sticky-note blocks: events, commands, read models, external events, errors.
// They map 1:1 onto Miro's native sticky palette (see blocks.ts).

import { STICKY_COLORS, type StickyBlockType } from '../blocks';
import { META_KEY, settleAtAbsolute } from '../miro/helpers';

export const STICKY_WIDTH = 200;

const STICKY_LABEL: Record<StickyBlockType, string> = {
  event: 'Event',
  command: 'Command',
  readModel: 'Read model',
  externalEvent: 'External event',
  error: 'Error',
};

export async function createSticky(type: StickyBlockType, x: number, y: number) {
  const sticky = await miro.board.createStickyNote({
    x,
    y,
    shape: 'square',
    width: STICKY_WIDTH,
    content: STICKY_LABEL[type],
    style: { fillColor: STICKY_COLORS[type] },
  });
  await sticky.setMetadata(META_KEY, { type });
  await settleAtAbsolute(sticky.id, x, y);
  return sticky;
}
