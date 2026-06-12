// Shared Miro SDK utilities and types used by every feature component.

// Every widget the app creates is tagged with metadata under this key, so the
// model stays machine-readable (future: grammar checks, JSON export).
export const META_KEY = 'em';

export type BoardItem = Awaited<ReturnType<typeof miro.board.get>>[number];
export type FrameItem = Extract<BoardItem, { type: 'frame' }>;
export type StickyItem = Extract<BoardItem, { type: 'sticky_note' }>;
export type Groupable = Parameters<typeof miro.board.group>[0]['items'][number];

// The `Unsupported` union member has `type: string`, so a plain equality
// check cannot narrow item unions — use this predicate instead.
export function isFrameItem(item: BoardItem | undefined): item is FrameItem {
  return !!item && item.type === 'frame' && 'title' in item;
}

export async function viewportCenter(): Promise<{ x: number; y: number }> {
  const viewport = await miro.board.viewport.get();
  return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
}

// Expands the viewport just enough to include the given items — never zooms in.
export async function ensureVisible(
  items: { x: number; y: number; width: number; height: number }[],
) {
  const margin = 100;
  const viewport = await miro.board.viewport.get();
  let left = viewport.x;
  let top = viewport.y;
  let right = viewport.x + viewport.width;
  let bottom = viewport.y + viewport.height;
  let fits = true;
  for (const item of items) {
    const l = item.x - item.width / 2 - margin;
    const t = item.y - item.height / 2 - margin;
    const r = item.x + item.width / 2 + margin;
    const b = item.y + item.height / 2 + margin;
    if (l < left || t < top || r > right || b > bottom) fits = false;
    left = Math.min(left, l);
    top = Math.min(top, t);
    right = Math.max(right, r);
    bottom = Math.max(bottom, b);
  }
  if (fits) return;
  await miro.board.viewport.set({
    viewport: { x: left, y: top, width: right - left, height: bottom - top },
    animationDurationInMs: 200,
  });
}

// Items created over a frame can get captured by it, with their stored
// coordinates ending up parent-relative while we supplied canvas-absolute —
// the item then "jumps" on the first click. Re-fetch and pin the intended
// position in the parent's coordinate space.
export async function settleAtAbsolute(itemId: string, absX: number, absY: number) {
  try {
    const [fresh] = await miro.board.get({ id: [itemId] });
    if (!fresh || !('parentId' in fresh) || !fresh.parentId) return;
    const [parent] = await miro.board.get({ id: [fresh.parentId] });
    if (!isFrameItem(parent)) return;
    const movable = fresh as unknown as { x: number; y: number; sync(): Promise<unknown> };
    movable.x = absX - (parent.x - parent.width / 2);
    movable.y = absY - (parent.y - parent.height / 2);
    await movable.sync();
  } catch (error) {
    console.warn('Could not settle a dropped item into its frame', error);
  }
}

// Copies carry Miro's native item link back to their source: the link badge
// marks them as copies, and clicking it jumps to the original.
export async function itemDeepLink(itemId: string): Promise<string | null> {
  try {
    const info = await miro.board.getInfo();
    return `https://miro.com/app/board/${info.id}/?moveToWidget=${itemId}`;
  } catch (error) {
    console.warn('Could not resolve the board id for item links', error);
    return null;
  }
}

// Puts an editable title above an item (screens, automations) and groups the
// pair so they move as one. Positions come from the intended absolute
// coordinates, not the anchor's — after settleAtAbsolute the anchor's own
// x/y may be parent-relative. Grouping is cosmetic cohesion — its failure
// must not fail the item itself.
export async function addTitleAbove(
  content: string,
  anchor: Groupable & { id: string; width: number; height: number },
  absX: number,
  absY: number,
) {
  const titleY = absY - anchor.height / 2 - 24;
  const title = await miro.board.createText({
    content,
    x: absX,
    y: titleY,
    width: anchor.width,
    style: { color: '#9c9cac', fontSize: 18, textAlign: 'center' },
  });
  await settleAtAbsolute(title.id, absX, titleY);
  try {
    await miro.board.group({ items: [anchor, title] });
  } catch (error) {
    console.warn('Could not group a title with its content', error);
  }
  return title;
}

// Surfaces the actual reason in the toast (Miro truncates around 80 chars).
export async function reportError(error: unknown) {
  console.error(error);
  const reason = error instanceof Error ? error.message : String(error);
  await miro.board.notifications.showError(`Failed: ${reason}`.slice(0, 78));
}
