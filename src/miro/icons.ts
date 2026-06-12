// Inline SVG icons shared by more than one feature, shipped as base64 data
// URLs so `createImage` can place them and they scale crisply on resize.

// The + button used by spec zones and slices. Clicking (selecting) it acts as
// a button press — boards have no real buttons, so selection is the click.
export const SPEC_ADD_SIZE = 36;
const PLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#ffffff" stroke="#b6b6c8" stroke-width="5"/><rect x="44" y="26" width="12" height="48" rx="5" fill="#4262ff"/><rect x="26" y="44" width="48" height="12" rx="5" fill="#4262ff"/></svg>`;
export const PLUS_ICON_URL = `data:image/svg+xml;base64,${btoa(PLUS_SVG)}`;
