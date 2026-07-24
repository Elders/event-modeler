// Draft a whole event model from a Figma file. A sibling of generateModel: it
// reads the file into a DesignDoc (through the DesignSource port), serializes it
// into a prompt, asks the same Planner for a ModelPlan, binds each screen block
// to its real Figma render, then hands the plan to the shared build engine —
// so checkpointing, resume, and the on-board banner all work identically.
//
// It needs BOTH the Figma token (to read the file) and the Anthropic key (the
// Planner drafts the model); the panel gates the action on both being set.

import {
  describeDesign,
  FIGMA_ADDENDUM,
  looksLikeScreenFlow,
  parseFigmaFileKey,
} from '../domain/designDoc';
import { buildFromPlan } from './generate';
import { requireDesignSource, requirePlanner } from './helpers';

const aborted = (signal?: AbortSignal): boolean => signal?.aborted === true;

export async function importFromFigma(fileInput: string, signal?: AbortSignal): Promise<void> {
  const key = parseFigmaFileKey(fileInput);
  if (!key) {
    throw new Error("That doesn't look like a Figma file link — paste the file's URL from your browser.");
  }

  const doc = await requireDesignSource().fetchDesign(key, signal);
  if (aborted(signal)) return;
  if (!looksLikeScreenFlow(doc)) {
    throw new Error(
      'No screens found in that file — it may be a component library rather than a screen flow.',
    );
  }

  const plan = await requirePlanner().plan(describeDesign(doc), signal, FIGMA_ADDENDUM);
  if (aborted(signal)) return;

  // Bind each screen block to its Figma frame's render: by ref (the planner was
  // asked to echo the frame's ref), else by matching the block label to the
  // frame name. A frame with no render just stays a placeholder.
  const byRef = new Map(doc.frames.map((frame) => [frame.ref, frame] as const));
  const byName = new Map(doc.frames.map((frame) => [frame.name.toLowerCase(), frame] as const));
  for (const slice of plan.slices) {
    for (const block of slice.blocks) {
      if (block.type !== 'screen') continue;
      const frame = byRef.get(block.ref) ?? byName.get(block.label.toLowerCase());
      if (frame?.renderUrl) block.imageUrl = frame.renderUrl;
    }
  }

  await buildFromPlan(plan, signal);
}
