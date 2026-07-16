// Shared helpers for the use-case layer, composed from the ports. These keep
// the feature modules free of repeated viewport/title/error/registry plumbing
// while still depending only on abstractions.

import { normalizeRecords, type FrameRecord } from '../domain/records';
import { centerOf, expansionToInclude, type Box } from '../domain/viewport';
import type { CanvasElement } from '../ports/canvas';
import type { Planner } from '../ports/planner';
import { services } from '../services';

// The Planner is wired only on the panel page; features that need it (model
// generation, its settings) get it through here, with a clear error on the
// board script where it is intentionally absent.
export function requirePlanner(): Planner {
  const { planner } = services();
  if (!planner) throw new Error('The model generator is only available from the panel.');
  return planner;
}

export async function viewportCenter(): Promise<{ x: number; y: number }> {
  return centerOf(await services().viewport.get());
}

// Expands the viewport just enough to include the given boxes — never zooms in.
export async function ensureVisible(boxes: Box[]): Promise<void> {
  const { viewport } = services();
  const expanded = expansionToInclude(await viewport.get(), boxes);
  if (expanded) await viewport.set(expanded);
}

// The element's absolute center. A child of a frame reports coords relative to
// the frame's top-left, so convert through the parent when present.
export async function absoluteCenter(el: CanvasElement): Promise<{ x: number; y: number }> {
  if (!el.parentId) return { x: el.x, y: el.y };
  const [parent] = await services().canvas.get([el.parentId]);
  if (!parent || parent.kind !== 'container') return { x: el.x, y: el.y };
  return { x: parent.x - parent.width / 2 + el.x, y: parent.y - parent.height / 2 + el.y };
}

// Puts an editable title above an element (screens, automations) and groups the
// pair so they move as one. Positions come from the intended absolute
// coordinates. Grouping is load-bearing, not cosmetic — a screen's fields box is
// found through its group, and the completeness check resolves endpoints through
// it — so a failure to group fails the call rather than leaving a half-built
// screen behind.
export async function addTitleAbove(
  content: string,
  anchor: CanvasElement,
  absX: number,
  absY: number,
): Promise<CanvasElement> {
  const { canvas } = services();
  const titleY = absY - anchor.height / 2 - 24;
  const title = await canvas.createText({
    content,
    x: absX,
    y: titleY,
    width: anchor.width,
    color: '#9c9cac',
    fontSize: 18,
    align: 'center',
  });
  await canvas.settle(title.id, absX, titleY);
  // Group with the anchor's whole existing group, not the anchor alone — an
  // adopted image may already sit in a user's group, and grouping just the pair
  // would split it out (same idiom as the fields box in fields/render).
  const members = await canvas.groupMembers(anchor.id);
  await canvas.group([...new Set([...members, title.id])]);
  return title;
}

// Surfaces the real reason in a notification (the Notifier truncates), and puts
// it in the log — a toast is gone in seconds, and the Console tab is where it
// can still be read afterwards and exported.
export async function reportError(error: unknown): Promise<void> {
  services().diagnostics.report('error', 'Action failed', error);
  const reason = error instanceof Error ? error.message : String(error);
  await services().notifier.error(`Failed: ${reason}`);
}

// Reads a frame registry, normalizing records written by older versions.
export async function readRecords(key: string): Promise<FrameRecord[]> {
  return normalizeRecords(await services().store.read<unknown>(key, []));
}
