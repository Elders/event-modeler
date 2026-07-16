// Adopting plain frames — the ones the user drew with the host's own tools,
// carrying no model metadata — as typed model structures: a slice or a
// specification. Sticky notes need no conversion: a sticky's fill color already
// denotes its block type, which is exactly what the Fields editor and the
// completeness check read, so a plain colored sticky already behaves as its block.

import { services } from '../services';
import type { SelectionItem } from '../ports/runtime';
import { adoptSliceFrame, readSliceRecords } from './slices';
import { adoptFrameAsSpec } from './specs/create';
import { readSpecRecords } from './specs/model';

export type FrameConvertTarget = 'slice' | 'spec';

// How many plain frames the current selection offers to convert — drives the
// panel's contextual buttons.
export interface ConvertTargets {
  frames: number;
}

// Counts against a selection the caller already has, rather than re-reading it:
// the panel's copy arrives on the free selection:update push, and
// `board.getSelection()` is a 500-credit call (Weight Level 3, as costly as
// `board.get`). Asking for what we were already handed cost 500 credits per
// keystroke of the hint — see DECISIONS.md.
export async function inspectSelection(selection: SelectionItem[]): Promise<ConvertTargets> {
  return { frames: (await convertibleFrames(selection)).length };
}

// Plain frames in the selection: containers not already registered as a slice
// or a specification. Generic over the selection element, since the identity and
// kind are all this needs: the panel passes free `SelectionItem`s and the
// conversion below passes the full `CanvasElement`s it must hand to the adopters.
async function convertibleFrames<T extends SelectionItem>(selection: T[]): Promise<T[]> {
  const frames = selection.filter((el) => el.kind === 'container');
  if (frames.length === 0) return [];
  const [specs, slices] = await Promise.all([readSpecRecords(), readSliceRecords()]);
  const taken = new Set([...specs, ...slices].map((record) => record.frame));
  return frames.filter((frame) => !taken.has(frame.id));
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
