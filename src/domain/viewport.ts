// Viewport geometry: pure math for keeping created content visible without
// ever zooming in. The host supplies the current viewport rectangle; this
// computes the expanded rectangle (or null when nothing needs to change).

export type Rect = { x: number; y: number; width: number; height: number };
export type Box = { x: number; y: number; width: number; height: number };

export function centerOf(viewport: Rect): { x: number; y: number } {
  return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
}

// The tight bounding box (center-based, like every Box here) enclosing a set of
// boxes, or null when there are none. Pure geometry, shared by callers that need
// to wrap a selection — e.g. drawing a slice around it.
export function boundingBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.x - box.width / 2);
    top = Math.min(top, box.y - box.height / 2);
    right = Math.max(right, box.x + box.width / 2);
    bottom = Math.max(bottom, box.y + box.height / 2);
  }
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
}

// Returns the smallest viewport that contains the current one plus every box
// (with margin), or null when everything already fits. Never shrinks the
// viewport, so the host never zooms in — it only ever expands to include.
export function expansionToInclude(viewport: Rect, boxes: Box[], margin = 100): Rect | null {
  let left = viewport.x;
  let top = viewport.y;
  let right = viewport.x + viewport.width;
  let bottom = viewport.y + viewport.height;
  let fits = true;
  for (const box of boxes) {
    const l = box.x - box.width / 2 - margin;
    const t = box.y - box.height / 2 - margin;
    const r = box.x + box.width / 2 + margin;
    const b = box.y + box.height / 2 + margin;
    if (l < left || t < top || r > right || b > bottom) fits = false;
    left = Math.min(left, l);
    top = Math.min(top, t);
    right = Math.max(right, r);
    bottom = Math.max(bottom, b);
  }
  if (fits) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
