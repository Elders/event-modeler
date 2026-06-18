// Generate a whole event model from a block of prose: ask the Planner for a
// ModelPlan, then build it on the canvas using the same use-cases the palette
// drives — blocks, connectors, slices, and Given/When/Then specs. This is a
// data-driven generalization of a pattern stamp.
//
// Layout is pure domain math (see domain/plan). Each slice frame is created
// first, then its blocks are placed inside it: plain cards are parented
// explicitly so they move with the slice, while grouped screen/automation pairs
// rely on the frame capturing them on creation (re-parenting would split them).

import { blockPosition, placeSlices, type ModelPlan } from '../domain/plan';
import type { SpecZoneId } from '../domain/spec';
import type { CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { connect } from './connectors';
import { createBlock } from './createBlock';
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
import { placeLinkedCopies } from './specs/copies';

export async function generateModel(text: string): Promise<void> {
  const plan = await requirePlanner().plan(text);
  const { canvas } = services();
  // Pace the board writes while building — a whole model is write-heavy enough
  // to trip Miro's rate limit if it bursts unthrottled. Always cleared, even on
  // failure, so later per-action writes run at full speed.
  canvas.setBulkMode(true);
  try {
    await buildModel(plan);
  } finally {
    canvas.setBulkMode(false);
  }
}

async function buildModel(plan: ModelPlan): Promise<void> {
  const { canvas, notifier } = services();
  const { x: cx, y: cy } = await viewportCenter();
  const placements = placeSlices(plan, cx, cy);

  // ref -> created element, for wiring links and spec copies afterwards.
  const blocks = new Map<string, CanvasElement>();
  const sliceFrames: CanvasElement[] = [];
  // Field records are rendered per block but persisted in one write at the end,
  // instead of a read-modify-write of the registry per block — generating a
  // whole model is write-heavy enough to trip Miro's rate limit otherwise.
  const fieldRecords: FieldRecord[] = [];

  // Everything is created sequentially: generating a whole model is far more
  // SDK calls than any manual action, and bursting them in parallel trips
  // Miro's rate limit. The adapter retries on a 429; pacing keeps it rare.
  for (const placement of placements) {
    const frame = await createSlice(placement.centerX, placement.centerY, {
      width: placement.width,
      height: placement.height,
      title: placement.slice.title,
    });
    sliceFrames.push(frame);

    const frameLeft = placement.centerX - placement.width / 2;
    const frameTop = placement.centerY - placement.height / 2;
    for (const block of placement.slice.blocks) {
      const { x, y } = blockPosition(placement, block);
      const element = await createBlock(block.type, x, y, block.label);
      // Parent plain cards into the slice so they move with it. Screens and
      // automations are grouped title+image pairs — re-parenting would split
      // the group, so they rely on the frame capturing them on creation.
      if (element.kind === 'card') {
        await canvas.addToContainer(frame.id, element.id, x - frameLeft, y - frameTop);
      }
      // Attach any planned fields (text on stickies, a box on screens/automations).
      // Render now, persist the registry once after the loop.
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
        fieldRecords.push(record);
      }
      blocks.set(block.ref, element);
    }
  }

  // One registry write for every field-bearing block built above.
  if (fieldRecords.length > 0) {
    const existing = await readFieldRecords();
    await services().store.write(FIELDS_KEY, [...existing, ...fieldRecords]);
  }

  // Connectors use SDK defaults; not every element accepts an endpoint, so a
  // failed link must not abort the build.
  for (const link of plan.links) {
    const from = blocks.get(link.from);
    const to = blocks.get(link.to);
    if (!from || !to) continue;
    try {
      await connect(from.id, to.id);
    } catch (error) {
      console.warn('Could not link generated blocks', error);
    }
  }

  // Specs are placed inside their slice (growing it) and grow as copies are
  // added, so they are built sequentially (each reads the registry the previous
  // one wrote, and re-reads the slice the previous spec may have grown).
  const specFrames: CanvasElement[] = [];
  for (const spec of plan.specs) {
    const sliceFrame = sliceFrames[plan.slices.findIndex((s) => s.ref === spec.slice)];
    if (!sliceFrame) continue;
    const specFrame = await createSpecification(sliceFrame);
    specFrames.push(specFrame);

    const zones: { id: SpecZoneId; refs: string[] }[] = [
      { id: 'given', refs: spec.given },
      { id: 'when', refs: spec.when },
      { id: 'then', refs: spec.then },
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
  }

  await ensureVisible([...sliceFrames, ...specFrames]);

  const sliceCount = plan.slices.length;
  const specCount = specFrames.length;
  await notifier.info(
    `Generated ${sliceCount} slice${sliceCount === 1 ? '' : 's'}` +
      (specCount > 0 ? ` and ${specCount} spec${specCount === 1 ? '' : 's'}` : '') +
      '.',
  );
}
