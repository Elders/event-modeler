// The automation block: not a sticky note by convention — a white disc with
// purple double gears, plus an editable title above it (grouped) so
// automations can be named.

import { META_KEY, addTitleAbove, settleAtAbsolute } from '../miro/helpers';

export const GEAR_SIZE = 120;

// An inline SVG image: unlike a shape with a text glyph, the graphic scales
// with the item when it is resized.
function gearMarkup(toothOffsetDeg: number): string {
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315]
    .map(
      (angle) =>
        `<rect x="44" y="8" width="12" height="18" rx="3" transform="rotate(${angle + toothOffsetDeg} 50 50)"/>`,
    )
    .join('');
  return `<g fill="#534ab7">${teeth}<circle cx="50" cy="50" r="24"/></g><circle cx="50" cy="50" r="10" fill="#ffffff"/>`;
}
const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#7f77dd" stroke-width="3"/><g transform="translate(38 60) scale(0.58) translate(-50 -50)">${gearMarkup(0)}</g><g transform="translate(67 33) scale(0.4) translate(-50 -50)">${gearMarkup(22)}</g></svg>`;
const GEAR_ICON_URL = `data:image/svg+xml;base64,${btoa(GEAR_SVG)}`;

export async function createAutomation(x: number, y: number) {
  const gear = await miro.board.createImage({
    url: GEAR_ICON_URL,
    x,
    y,
    width: GEAR_SIZE,
  });
  await gear.setMetadata(META_KEY, { type: 'automation' });
  await settleAtAbsolute(gear.id, x, y);
  await addTitleAbove('Automation', gear, x, y);
  return gear;
}
