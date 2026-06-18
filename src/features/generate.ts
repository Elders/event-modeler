// Generate a whole event model from a block of prose: ask the Planner for a
// ModelPlan, then build it on the canvas using the same use-cases the palette
// drives — blocks, connectors, slices, and Given/When/Then specs.
//
// The build is interruptible and resumable. The abort signal is checked before
// each individual write-producing step (each slice frame, block, link, spec), so
// Stop is prompt. Progress is checkpointed to the document (see
// generateCheckpoint) at that same granularity — `refToId` records every created
// element and `progress` is the resume cursor — so resume skips what's already
// there and never duplicates. Stop, a reload, or a failure (e.g. an exhausted
// rate-limit retry) leaves the checkpoint in place for resume.
//
// Layout is pure domain math (see domain/plan). Each slice frame is created
// first, then its blocks are placed inside it: plain cards are parented
// explicitly so they move with the slice, while grouped screen/automation pairs
// rely on the frame capturing them on creation (re-parenting would split them).

import { blockPosition, placeSlices, type GenerationCheckpoint, type ModelPlan } from '../domain/plan';
import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { connect } from './connectors';
import { createBlock } from './createBlock';
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from './generateCheckpoint';
import {
  FIELDS_KEY,
  isFieldable,
  newFieldId,
  readFieldRecords,
  type FieldRecord,
} from './fields/model';
import { renderFields } from './fields/render';
import { ensureVisible, requirePlanner, viewportCenter } from './helpers';
import { createSlice } from './slices';
import { createSpecification } from './specs/create';
import { placeLinkedCopies, placeZoneCards } from './specs/copies';

const aborted = (signal?: AbortSignal): boolean => signal?.aborted === true;

// Start a fresh generation: capture a checkpoint, then plan + build under it.
export async function generateModel(text: string, signal?: AbortSignal): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste some text to model first.');
  const origin = await viewportCenter();
  const checkpoint: GenerationCheckpoint = {
    text: trimmed,
    origin,
    plan: null,
    refToId: {},
    progress: { slice: 0, block: 0, links: 0, specs: 0 },
    pendingFields: [],
  };
  await saveCheckpoint(checkpoint);
  await runGeneration(checkpoint, signal);
}

// Continue a paused generation from its persisted checkpoint.
export async function resumeGeneration(signal?: AbortSignal): Promise<void> {
  const checkpoint = await loadCheckpoint();
  if (!checkpoint) return;
  await runGeneration(checkpoint, signal);
}

async function runGeneration(checkpoint: GenerationCheckpoint, signal?: AbortSignal): Promise<void> {
  const { canvas } = services();
  // Pace the board writes while building — a whole model is write-heavy enough
  // to trip Miro's rate limit if it bursts unthrottled. Always cleared, even on
  // abort or failure, so later per-action writes run at full speed. The signal
  // lets pacing drop on Pause so the current unit finishes promptly.
  canvas.setBulkMode(true, signal);
  try {
    // Plan first if we don't have one yet (fresh run, or a run cancelled mid-plan).
    if (!checkpoint.plan) {
      let plan: ModelPlan;
      try {
        plan = await requirePlanner().plan(checkpoint.text, signal);
      } catch (error) {
        if (aborted(signal)) return; // user cancelled the request — keep the checkpoint, resume re-asks
        await clearCheckpoint(); // genuine planning failure — nothing built to resume
        throw error;
      }
      if (plan.slices.length === 0) {
        await clearCheckpoint();
        throw new Error('The AI did not produce any model blocks — try a more detailed description.');
      }
      checkpoint.plan = plan;
      await saveCheckpoint(checkpoint);
    }
    if (aborted(signal)) return; // stopped right after planning — resume picks up the build
    await buildModel(checkpoint, signal);
  } finally {
    canvas.setBulkMode(false);
  }
}

async function buildModel(checkpoint: GenerationCheckpoint, signal?: AbortSignal): Promise<void> {
  const { canvas, notifier } = services();
  const plan = checkpoint.plan!;
  const placements = placeSlices(plan, checkpoint.origin.x, checkpoint.origin.y);

  // Reconstruct the ref→element map from whatever was already created (on a
  // resume), so links and spec copies can reference earlier blocks.
  const blocks = new Map<string, CanvasElement>();
  const knownIds = Object.values(checkpoint.refToId);
  if (knownIds.length > 0) {
    const live = await canvas.get(knownIds);
    const byId = new Map(live.map((el) => [el.id, el] as const));
    for (const [ref, id] of Object.entries(checkpoint.refToId)) {
      const el = byId.get(id);
      if (el) blocks.set(ref, el); // a missing id means the user deleted it — skip gracefully
    }
  }

  // Phase 1 — slices. Each block is a checkpoint step, so Stop is prompt and a
  // mid-slice resume continues block-by-block.
  for (let i = checkpoint.progress.slice; i < placements.length; i++) {
    const placement = placements[i];
    // The slice frame: create it unless this slice already has one (resume).
    let frame = blocks.get(placement.slice.ref);
    if (!frame) {
      if (aborted(signal)) return await pause(checkpoint, { slice: i, block: 0 });
      frame = await createSlice(placement.centerX, placement.centerY, {
        width: placement.width,
        height: placement.height,
        title: placement.slice.title,
      });
      checkpoint.refToId[placement.slice.ref] = frame.id;
      blocks.set(placement.slice.ref, frame);
      await saveCheckpoint(checkpoint);
    }

    const frameLeft = placement.centerX - placement.width / 2;
    const frameTop = placement.centerY - placement.height / 2;
    const startBlock = i === checkpoint.progress.slice ? checkpoint.progress.block : 0;
    for (let j = startBlock; j < placement.slice.blocks.length; j++) {
      if (aborted(signal)) return await pause(checkpoint, { slice: i, block: j });
      const block = placement.slice.blocks[j];
      const { x, y } = blockPosition(placement, block);
      const element = await createBlock(block.type, x, y, block.label);
      // Parent plain cards into the slice so they move with it. Screens and
      // automations are grouped title+image pairs — re-parenting would split
      // the group, so they rely on the frame capturing them on creation.
      if (element.kind === 'card') {
        await canvas.addToContainer(frame.id, element.id, x - frameLeft, y - frameTop);
      }
      // Attach any planned fields (text on stickies, a box on screens/automations).
      // The record rides on the checkpoint until the slice completes, so a Stop
      // here doesn't strand it.
      if (block.fields.length > 0 && isFieldable(block.type)) {
        const record: FieldRecord = {
          element: element.id,
          type: block.type,
          fields: block.fields.map((field) => ({
            id: newFieldId(),
            name: field.name,
            type: field.type,
          })),
          card: null,
        };
        await renderFields(record, element);
        checkpoint.pendingFields.push(record);
      }
      checkpoint.refToId[block.ref] = element.id;
      blocks.set(block.ref, element);
      checkpoint.progress = { ...checkpoint.progress, slice: i, block: j + 1 };
      await saveCheckpoint(checkpoint);
    }

    // Slice complete: flush its field records (one write per slice), advance.
    if (checkpoint.pendingFields.length > 0) {
      const existing = await readFieldRecords();
      await services().store.write(FIELDS_KEY, [...existing, ...checkpoint.pendingFields]);
      checkpoint.pendingFields = [];
    }
    checkpoint.progress = { ...checkpoint.progress, slice: i + 1, block: 0 };
    await saveCheckpoint(checkpoint);
  }

  // Phase 2 — links. Connectors use SDK defaults; not every element accepts an
  // endpoint, so a failed link must not abort the build.
  for (let i = checkpoint.progress.links; i < plan.links.length; i++) {
    if (aborted(signal)) return;
    const link = plan.links[i];
    const from = blocks.get(link.from);
    const to = blocks.get(link.to);
    if (from && to) {
      try {
        await connect(from.id, to.id);
      } catch (error) {
        console.warn('Could not link generated blocks', error);
      }
    }
    checkpoint.progress = { ...checkpoint.progress, links: i + 1 };
    await saveCheckpoint(checkpoint);
  }

  // Phase 3 — specs. Each is placed inside its slice (growing it) and grows as
  // copies are added, so they are built one at a time.
  const specFrames: CanvasElement[] = [];
  for (let i = checkpoint.progress.specs; i < plan.specs.length; i++) {
    if (aborted(signal)) return;
    const spec = plan.specs[i];
    const sliceFrameId = checkpoint.refToId[spec.slice];
    if (sliceFrameId) {
      const [sliceFrame] = await canvas.get([sliceFrameId]);
      if (sliceFrame && sliceFrame.kind === 'container') {
        const specFrame = await createSpecification(sliceFrame);
        specFrames.push(specFrame);

        const zones = [
          { id: 'given' as const, refs: spec.given },
          { id: 'when' as const, refs: spec.when },
          { id: 'then' as const, refs: spec.then },
        ];
        for (const zone of zones) {
          const sources = zone.refs
            .map((ref) => blocks.get(ref))
            .filter((el): el is CanvasElement => !!el && el.kind === 'card');
          if (sources.length === 0) continue;
          // Re-read the frame: a previous zone may have grown it, and
          // placeLinkedCopies computes the next growth from the frame's geometry.
          const [current] = await canvas.get([specFrame.id]);
          if (current && current.kind === 'container') {
            await placeLinkedCopies(current, zone.id, sources);
          }
        }
        // Failure outcomes: red error stickies in the Then zone — no source, no
        // link, and the only place errors appear.
        if (spec.errors.length > 0) {
          const [current] = await canvas.get([specFrame.id]);
          if (current && current.kind === 'container') {
            await placeZoneCards(
              current,
              'then',
              spec.errors.map((label) => ({ content: label, color: 'red' })),
            );
          }
        }
      }
    }
    checkpoint.progress = { ...checkpoint.progress, specs: i + 1 };
    await saveCheckpoint(checkpoint);
  }

  // Done — the whole plan is built. Clear the checkpoint and report.
  await clearCheckpoint();

  const sliceFrames = plan.slices
    .map((slice) => blocks.get(slice.ref))
    .filter((el): el is CanvasElement => !!el);
  await ensureVisible([...sliceFrames, ...specFrames]);

  const sliceCount = plan.slices.length;
  const specCount = plan.specs.length;
  await notifier.info(
    `Generated ${sliceCount} slice${sliceCount === 1 ? '' : 's'}` +
      (specCount > 0 ? ` and ${specCount} spec${specCount === 1 ? '' : 's'}` : '') +
      '.',
  );
}

// Records the resume cursor and stops — the checkpoint is left in place so a
// later resume continues from exactly here.
async function pause(
  checkpoint: GenerationCheckpoint,
  at: { slice: number; block: number },
): Promise<void> {
  checkpoint.progress = { ...checkpoint.progress, slice: at.slice, block: at.block };
  await saveCheckpoint(checkpoint);
}
