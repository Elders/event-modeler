// Viewport geometry: pure math for keeping created content visible without
// ever zooming in. The host supplies the current viewport rectangle; this
// computes the expanded rectangle (or null when nothing needs to change).

export type Rect = { x: number; y: number; width: number; height: number };
export type Box = { x: number; y: number; width: number; height: number };

export function centerOf(viewport: Rect): { x: number; y: number } {
  return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
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
