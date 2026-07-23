// The arrow toolset behind the Fields tab's connector view: what a selected
// arrow connects, moving fields across it, and navigating to either end.
//
// Everything here is user-triggered — nothing polls, nothing runs unattended —
// and every read the actions depend on is FRESH (canvas.getFresh /
// connectorById, both getById at Level 1), never a cached handle: an endpoint
// gets dragged, retyped, re-attached or deleted with no event to say so, and a
// stale answer here doesn't fail, it silently copies old fields or pans to
// where a block used to be. A typical sticky-to-sticky arrow resolves in three
// Level-1 calls; only an endpoint that turns out to be (part of) a grouped
// screen/automation adds the one board-wide groups() read, shared across both
// ends.

import {
  extractName,
  parseBoxFields,
  parseStickyFields,
  type Field,
} from '../domain/fields';
import { mergeFields, projectForTransfer } from '../domain/fieldTransfer';
import { boundingBox, panTo, type Box } from '../domain/viewport';
import { BLOCKS, stickyTypeForColor, type BlockType } from '../domain/vocabulary';
import type { CanvasElement, CanvasGroup } from '../ports/canvas';
import { services } from '../services';
import { completenessHousekeeping } from './completeness';
import { noteBoardFields } from './fields/base';
import { fieldsBoxAmong } from './fields/board';
import { setFields as saveFields } from './fields/edit';
import { isFieldable, readFieldRecords, recordFor } from './fields/model';

// One attached end of the arrow, resolved to the element that carries the data
// (the image for a screen/automation, the sticky itself otherwise).
export interface ArrowEndpoint {
  id: string;
  // The recognized block type, or null for something the model doesn't know —
  // a plain shape, an untyped sticky, a frame.
  type: BlockType | null;
  // What to call it on a button: the block label ("Command"), or the element
  // kind ("shape") when unrecognized.
  label: string;
  // The block's own name (a sticky's first line, a screen's title) — '' when
  // there is none to read.
  name: string;
  fieldable: boolean;
  // What it carries right now — read off the board at describe time, so button
  // states and counts reflect the moment of selection, not a cache.
  fields: Field[];
  // Absolute bounds, for navigation.
  box: Box;
}

export interface ArrowInfo {
  connector: string;
  // null: that end floats free, or nothing on the board answers for its id.
  start: ArrowEndpoint | null;
  end: ArrowEndpoint | null;
}

export type TransferDirection = 'along' | 'against';
export type TransferMode = 'copy' | 'replace';

// The outcome, for the panel to show. `applied: false` is not a failure — its
// reasons are states of the board (an end came loose, the source is empty); a
// genuine failure to read or write throws instead, like everywhere.
export interface TransferOutcome {
  applied: boolean;
  message: string;
}

// Shared lookups within one describe: both ends often sit in the same slice
// frame (one parent fetch, not two), and the groups() read — the only Level 3
// call this feature can make — is taken at most once however both ends resolve.
interface ResolveMemo {
  groups: CanvasGroup[] | null;
  parents: Map<string, CanvasElement | null>;
}

const newMemo = (): ResolveMemo => ({ groups: null, parents: new Map() });

async function lookupGroups(memo: ResolveMemo): Promise<CanvasGroup[]> {
  return (memo.groups ??= await services().canvas.groups());
}

// null means the board answered: this id is not a connector any more.
export async function describeArrow(connectorId: string): Promise<ArrowInfo | null> {
  const connector = await services().canvas.connectorById(connectorId);
  if (!connector) return null;
  const memo = newMemo();
  const start = connector.start ? await resolveEndpoint(connector.start, memo) : null;
  const end = connector.end ? await resolveEndpoint(connector.end, memo) : null;
  return { connector: connectorId, start, end };
}

async function resolveEndpoint(id: string, memo: ResolveMemo): Promise<ArrowEndpoint | null> {
  const { canvas } = services();
  const [element] = await canvas.getFresh([id]);
  if (element?.kind === 'card') return stickyEndpoint(element, memo);
  if (
    element &&
    element.kind !== 'image' &&
    element.kind !== 'shape' &&
    element.kind !== 'text' &&
    element.kind !== 'unknown'
  ) {
    return plainEndpoint(element, memo);
  }
  // An image, a shape, a text — or an id getById answers "gone" for, which is
  // what a group id looks like to it. Any of these can be (part of) a grouped
  // screen/automation, and the one shared groups() read resolves them all to
  // the group's image member.
  const groups = await lookupGroups(memo);
  const group = groups.find((g) => g.id === id || g.members.includes(id));
  if (!group) return element ? plainEndpoint(element, memo) : null;
  const members = await canvas.getFresh(group.members);
  const image = members.find((member) => member.kind === 'image');
  // A grouping with no image is a plain user grouping, not a screen.
  if (!image) return element ? plainEndpoint(element, memo) : null;
  return imageEndpoint(image, members, memo);
}

async function stickyEndpoint(element: CanvasElement, memo: ResolveMemo): Promise<ArrowEndpoint> {
  const type = stickyTypeForColor(element.color);
  const fieldable = isFieldable(type);
  return {
    id: element.id,
    type,
    label: type ? blockLabel(type) : 'sticky',
    name: extractName(element.content),
    fieldable,
    fields: fieldable ? parseStickyFields(element.content) : [],
    box: await absoluteBounds(element, memo),
  };
}

async function imageEndpoint(
  image: CanvasElement,
  members: CanvasElement[],
  memo: ResolveMemo,
): Promise<ArrowEndpoint> {
  const meta = await services().canvas.getMeta(image.id);
  const metaType = meta?.type;
  const type = isFieldable(metaType) ? metaType : null;
  const title = members.find((member) => member.kind === 'text');
  // Read the fields the way the completeness check does: the tagged box on the
  // board first, the registry record only when the box is missing (evicted or
  // deleted — the record is the memory housekeeping rebuilds it from).
  let fields: Field[] = [];
  if (type) {
    const box = await fieldsBoxAmong(members);
    fields = box
      ? parseBoxFields(box.content)
      : (recordFor(await readFieldRecords(), image.id)?.fields ?? []);
  }
  const bounds = await Promise.all(members.map((member) => absoluteBounds(member, memo)));
  return {
    id: image.id,
    type,
    label: type ? blockLabel(type) : 'image',
    name: title ? extractName(title.content) : '',
    fieldable: type !== null,
    fields,
    // Navigate to the whole group — title, image and box together.
    box: boundingBox(bounds) ?? (await absoluteBounds(image, memo)),
  };
}

const KIND_LABEL: Partial<Record<CanvasElement['kind'], string>> = {
  card: 'sticky',
  image: 'image',
  text: 'text',
  container: 'frame',
  shape: 'shape',
};

async function plainEndpoint(element: CanvasElement, memo: ResolveMemo): Promise<ArrowEndpoint> {
  return {
    id: element.id,
    type: null,
    label: KIND_LABEL[element.kind] ?? 'item',
    name: '',
    fieldable: false,
    fields: [],
    box: await absoluteBounds(element, memo),
  };
}

function blockLabel(type: BlockType): string {
  return BLOCKS.find((block) => block.type === type)?.label ?? type;
}

// CanvasElement coordinates are local — parent-relative for frame children,
// measured from the frame's top-left — while the viewport speaks absolute.
// Frames never nest, so one hop resolves any element. A parent that is gone
// leaves the local coords as the best remaining answer.
async function absoluteBounds(element: CanvasElement, memo: ResolveMemo): Promise<Box> {
  const local = { x: element.x, y: element.y, width: element.width, height: element.height };
  if (!element.parentId) return local;
  let parent = memo.parents.get(element.parentId);
  if (parent === undefined) {
    [parent = null] = await services().canvas.getFresh([element.parentId]);
    memo.parents.set(element.parentId, parent);
  }
  if (!parent) return local;
  return {
    x: parent.x - parent.width / 2 + element.x,
    y: parent.y - parent.height / 2 + element.y,
    width: element.width,
    height: element.height,
  };
}

function endpointName(endpoint: ArrowEndpoint): string {
  return endpoint.name || endpoint.label;
}

// Copies or replaces fields across the arrow. The arrow is re-described fresh
// at click time — the gap since the buttons rendered is exactly where an
// endpoint gets edited or deleted, with no event to say so — and the write goes
// through the fields use-case, so box rebuilding, the registry follower and the
// mid-write conflict check all apply unchanged.
export async function transferFields(
  connectorId: string,
  direction: TransferDirection,
  mode: TransferMode,
): Promise<TransferOutcome> {
  const info = await describeArrow(connectorId);
  if (!info) return { applied: false, message: 'This arrow no longer exists on the board.' };
  const source = direction === 'along' ? info.start : info.end;
  const target = direction === 'along' ? info.end : info.start;
  if (!source || !target) {
    return { applied: false, message: "This arrow isn't attached to a block on both ends." };
  }
  if (!source.fieldable) {
    return { applied: false, message: `This ${source.label.toLowerCase()} can't carry fields.` };
  }
  if (!target.fieldable || !target.type) {
    return { applied: false, message: `This ${target.label.toLowerCase()} can't carry fields.` };
  }
  const incoming = projectForTransfer(source.fields);
  if (incoming.length === 0) {
    return { applied: false, message: `${endpointName(source)} has no fields to carry over.` };
  }
  const next = mode === 'copy' ? mergeFields(target.fields, incoming) : incoming;
  const added = next.length - target.fields.length;
  if (mode === 'copy' && added === 0) {
    return {
      applied: true,
      message: `${endpointName(target)} already carries every field of ${endpointName(source)}.`,
    };
  }
  // The fresh read above IS the board's current state; noting it as the base
  // lets the write's conflict check compare now against now, instead of against
  // whatever the panel editor last saw of this block.
  noteBoardFields(target.id, target.fields);
  const outcome = await saveFields(target.id, target.type, next);
  if (!outcome.applied) {
    return {
      applied: false,
      message: "The block's fields changed on the board mid-write, so nothing was overwritten.",
    };
  }
  // Recolor the arrows for this user right away instead of waiting for the
  // headless poll — the same nudge a panel field edit gives.
  void completenessHousekeeping();
  const message =
    mode === 'replace'
      ? `Replaced ${endpointName(target)}'s fields with ${incoming.length} from ${endpointName(source)}.`
      : `Copied ${added} field${added === 1 ? '' : 's'} to ${endpointName(target)}.`;
  return { applied: true, message };
}

// Pans the viewport to the endpoint — centered, at the current zoom, never
// zooming in (panTo grows only when the block doesn't fit). Re-fetched first:
// the position captured when the arrow was described goes stale the moment
// someone drags the block. false means the element is gone from the board.
export async function navigateToEndpoint(endpoint: ArrowEndpoint): Promise<boolean> {
  const { canvas, viewport } = services();
  const [fresh] = await canvas.getFresh([endpoint.id]);
  if (!fresh) return false;
  const view = await viewport.get();
  await viewport.set(panTo(view, await absoluteBounds(fresh, newMemo())));
  return true;
}
