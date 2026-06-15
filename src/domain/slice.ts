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
