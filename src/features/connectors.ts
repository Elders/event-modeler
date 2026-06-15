// Links use the canvas default style — zero overrides — so a generated link is
// indistinguishable from a hand-drawn one.

import { services } from '../services';

export async function connect(fromId: string, toId: string): Promise<void> {
  await services().canvas.createLink(fromId, toId);
}
