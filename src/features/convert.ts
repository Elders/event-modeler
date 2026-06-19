// Adopting plain frames — the ones the user drew with the host's own tools,
// carrying no model metadata — as typed model structures: a slice or a
// specification. Sticky notes need no conversion: a sticky's fill color already
// denotes its block type, which is exactly what the Fields editor and the
// completeness check read, so a plain colored sticky already behaves as its block.

import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { adoptSliceFrame, readSliceRecords } from './slices';
import { adoptFrameAsSpec } from './specs/create';
import { readSpecRecords } from './specs/model';

export type FrameConvertTarget = 'slice' | 'spec';

// How many plain frames the current selection offers to convert — drives the
// panel's contextual buttons.
export interface ConvertTargets {
  frames: number;
}

export async function inspectSelection(): Promise<ConvertTargets> {
  const selection = await services().canvas.selection();
  return { frames: (await convertibleFrames(selection)).length };
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
