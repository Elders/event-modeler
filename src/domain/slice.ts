// Slice geometry: a slice spans the full three-lane stack (3 x 500), cutting
// the model into vertical feature strips, and carries an "add specification"
// button affixed to its bottom-center. Pure layout math — no platform here.

export const SLICE_WIDTH = 700;
export const SLICE_HEIGHT = 1500;
export const SLICE_BUTTON_INSET = 30;

// Frame-relative position of the add-spec button for a slice of the given size.
export function sliceButtonOffset(
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: width / 2, y: height - SLICE_BUTTON_INSET };
}

// Placing a specification inside a slice. Frames can't nest, so the spec isn't a
// real child — it is positioned within the slice's bounds and the slice grows
// downward to enclose it. The spec is centered `gap` below the slice's current
// content (`contentBottom`: the slice's own bottom edge, or the lowest spec
// already inside), and the slice's bottom extends to sit `gap` below the spec —
// leaving room for the add-spec button. The top edge stays put, so the model
// content above doesn't move.
export function sliceSpecPlacement(
  slice: { y: number; height: number },
  contentBottom: number,
  specHeight: number,
  gap: number,
): { specY: number; sliceHeight: number; sliceY: number } {
  const specY = contentBottom + gap + specHeight / 2;
  const requiredBottom = specY + specHeight / 2 + gap;
  const currentBottom = slice.y + slice.height / 2;
  const growth = Math.max(0, requiredBottom - currentBottom);
  return { specY, sliceHeight: slice.height + growth, sliceY: slice.y + growth / 2 };
}
