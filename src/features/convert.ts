// Adopting plain board items — the ones the user drew with the host's own tools,
// carrying no model metadata — into typed model elements. A plain sticky note
// becomes the block its fill color denotes (so it gains a type and can carry
// fields); a plain frame becomes a slice or a specification. Every operation
// works across the whole selection at once.

import { LINKS_KEY, type SpecLink } from '../domain/records';
import { stickyTypeForColor } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { adoptSliceFrame, readSliceRecords } from './slices';
import { adoptFrameAsSpec } from './specs/create';
import { readSpecRecords } from './specs/model';

export type FrameConvertTarget = 'slice' | 'spec';

// What the current selection offers to convert — drives the panel's contextual
// buttons.
export interface ConvertTargets {
  stickies: number;
  frames: number;
}

export async function inspectSelection(): Promise<ConvertTargets> {
  const selection = await services().canvas.selection();
  const [stickies, frames] = await Promise.all([
    convertibleStickies(selection),
    convertibleFrames(selection),
  ]);
  return { stickies: stickies.length, frames: frames.length };
}

// Plain stickies in the selection: a sticky card whose color maps to a block
// type, with no tool metadata, that isn't a spec copy (copies are unmetadata'd
// cards too, so they're excluded by the link registry).
async function convertibleStickies(selection: CanvasElement[]): Promise<CanvasElement[]> {
  const { canvas, store } = services();
  const cards = selection.filter(
    (el) => el.kind === 'card' && stickyTypeForColor(el.color) !== null,
  );
  if (cards.length === 0) return [];
  const links = await store.read<SpecLink[]>(LINKS_KEY, []);
  const copyIds = new Set(links.map((link) => link.copy));
  const plain: CanvasElement[] = [];
  for (const card of cards) {
    if (copyIds.has(card.id)) continue;
    if (await canvas.getMeta(card.id)) continue; // already a typed/tool element
    plain.push(card);
  }
  return plain;
}

// Plain frames in the selection: containers not already registered as a slice
// or a specification.
async function convertibleFrames(selection: CanvasElement[]): Promise<CanvasElement[]> {
  const frames = selection.filter((el) => el.kind === 'container');
  if (frames.length === 0) return [];
  const [specs, slices] = await Promise.all([readSpecRecords(), readSliceRecords()]);
  const taken = new Set([...specs, ...slices].map((record) => record.frame));
  return frames.filter((frame) => !taken.has(frame.id));
}

// Tags each plain sticky with the block type its color denotes; its existing
// text becomes the block name, so nothing the user wrote is lost.
export async function convertStickies(): Promise<number> {
  const { canvas, notifier } = services();
  const targets = await convertibleStickies(await canvas.selection());
  for (const card of targets) {
    const type = stickyTypeForColor(card.color);
    if (type) await canvas.setMeta(card.id, { type });
  }
  if (targets.length > 0) {
    const noun = targets.length === 1 ? 'sticky note' : 'sticky notes';
    await notifier.info(`Converted ${targets.length} ${noun} to typed blocks.`);
  }
  return targets.length;
}

// Adopts each plain frame as a slice or a specification.
export async function convertFrames(target: FrameConvertTarget): Promise<number> {
  const { canvas, notifier } = services();
  const targets = await convertibleFrames(await canvas.selection());
  for (const frame of targets) {
    if (target === 'slice') {
      await canvas.apply([{ id: frame.id, color: 'transparent' }]);
      await adoptSliceFrame(frame);
    } else {
      await adoptFrameAsSpec(frame);
    }
  }
  if (targets.length > 0) {
    const noun = target === 'slice' ? 'slice' : 'specification';
    const plural = targets.length === 1 ? noun : `${noun}s`;
    await notifier.info(`Converted ${targets.length} ${targets.length === 1 ? 'frame' : 'frames'} to ${plural}.`);
  }
  return targets.length;
}
