// The information-completeness pass, run from the headless board script: it
// validates that every field-bearing element has its fields provided by the
// elements pointing into it, which supply them together — when their pooled
// fields don't cover the target's (matched by name and type), every arrow into
// that target reddens and is captioned with the fields nobody supplies. There
// are no connector events, so it polls — the flagging is reconciled against a
// registry of flagged connectors so a closed gap restores each arrow to the
// exact color it had before and takes the caption back off.
//
// The caption overwrites whatever the arrow carried, and a hand-written one is
// not preserved or restored (a deliberate product call — see DECISIONS.md).
// Only arrows in the flag registry are ever written, so an arrow the check
// never flagged keeps its caption untouched.
//
// Fields are read from what's drawn on the board (sticky text / attached box),
// not the em-fields registry: the registry is a lazily-populated cache that can
// lag the canvas, and this check must work for every field-bearing block whether
// or not the panel has ever synced it.

import {
  captionShowsGap,
  completenessGaps,
  gapCaption,
  type FieldedElement,
} from '../domain/completeness';
import { htmlToLines, parseBoxFields } from '../domain/fields';
import { FLAGS_KEY, type ConnectorFlag } from '../domain/records';
import type { CanvasConnector, CanvasElement } from '../ports/canvas';
import { services } from '../services';
import { fieldsBoxAmong, stickyFields } from './fields/board';

// Miro's red; the default we fall back to if a flagged connector somehow had no
// stroke color to remember.
const INCOMPLETE_COLOR = '#F24726';
const DEFAULT_CONNECTOR_COLOR = '#1a1a1a';

// Whether a connector's live color is our incomplete red, compared case-
// insensitively because Miro can echo the stored color back in a different case.
// Only used to catch legacy orphan reds; the flag registry is the primary record.
function isIncompleteColor(color: string | null): boolean {
  return typeof color === 'string' && color.toLowerCase() === INCOMPLETE_COLOR.toLowerCase();
}


let running = false;

export async function completenessHousekeeping(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await checkCompleteness();
  } catch (error) {
    console.warn('Completeness check failed', error);
  } finally {
    running = false;
  }
}

async function checkCompleteness(): Promise<void> {
  const { canvas, store } = services();
  const connectors = await canvas.connectors();
  const flags = await store.read<ConnectorFlag[]>(FLAGS_KEY, []);
  if (connectors.length === 0 && flags.length === 0) return;

  // Resolve grouped endpoints to their fielded image and read each connected
  // element's fields straight off the board — in a fixed handful of batched
  // reads, regardless of model size.
  const { resolved, elements } = await analyze(connectors);
  const gaps = completenessGaps(elements, resolved);

  // Reconcile each connector against whether it should be flagged. The decision
  // is driven by the persisted flag registry, NOT by reading the connector's
  // live color back — Miro normalizes the stored color string (case/format), so
  // a comparison against INCOMPLETE_COLOR is unreliable and would strand arrows
  // red. The registry is the reliable record of what we reddened; a live-color
  // check is only a fallback to clean up legacy orphans (arrows reddened while
  // em-flags couldn't be written). Writes are idempotent: a stable board does none.
  const flagsById = new Map(flags.map((flag) => [flag.connector, flag] as const));
  const kept: ConnectorFlag[] = [];
  let changed = false;

  for (const connector of connectors) {
    const missing = gaps.get(connector.id);
    const existing = flagsById.get(connector.id);

    if (missing) {
      if (existing) {
        kept.push(existing); // already reddened by us — leave the color, no write
      } else {
        await canvas.setConnectorColor(connector.id, INCOMPLETE_COLOR);
        kept.push({ connector: connector.id, original: connector.color ?? DEFAULT_CONNECTOR_COLOR });
        changed = true;
      }
      // The caption names the gap, and the gap moves as fields are filled in —
      // so it's written whenever the line doesn't already show it, not just on
      // first flag. No registry write: the flag record is unaffected by the text.
      if (!captionShowsGap(htmlToLines(connector.caption), missing)) {
        await canvas.setConnectorCaption(connector.id, gapCaption(missing));
      }
    } else if (existing) {
      // No longer incomplete — restore to the remembered pre-red color and clear
      // the caption, drop the flag. Registry-driven, so it works regardless of
      // how the color reads back. Only arrows we flagged are cleared, so the
      // pass never strips a caption off an arrow it doesn't own.
      await canvas.setConnectorColor(connector.id, existing.original);
      if (connector.caption !== null) await canvas.setConnectorCaption(connector.id, null);
      changed = true;
    } else if (isIncompleteColor(connector.color)) {
      // Red but untracked (reddened while em-flags couldn't be written) — restore.
      await canvas.setConnectorColor(connector.id, DEFAULT_CONNECTOR_COLOR);
      changed = true;
    }
  }

  // Flags whose connector was deleted are dropped (kept is built only from live
  // connectors); persist whenever the tracked set changed.
  if (kept.length !== flags.length) changed = true;
  if (changed) await store.write(FLAGS_KEY, kept);
}

// Resolves grouped endpoints to their fielded image and reads each connected
// element's fields from the board. A screen/automation is a title + image + box
// group, and a connector can attach to the group id or any member — none of
// which is the fielded image — so endpoints are remapped to the group's lone
// image member (registry-free, so it works before the panel has synced). The
// reads are batched to a fixed few calls — the groups, all grouped members at
// once (which also yields each group's shape contents), then the remaining
// sticky endpoints in one fetch — plus one metadata read per shape grouped
// with a *connected* screen, to pick the tagged fields box among them.
async function analyze(
  connectors: CanvasConnector[],
): Promise<{ resolved: CanvasConnector[]; elements: FieldedElement[] }> {
  const { canvas } = services();
  const groups = await canvas.groups();
  const memberIds = [...new Set(groups.flatMap((group) => group.members))];
  const membersById = new Map(
    (memberIds.length > 0 ? await canvas.get(memberIds) : []).map((el) => [el.id, el] as const),
  );

  const toImage = new Map<string, string>(); // group id / any member → fielded image
  const shapesByImage = new Map<string, CanvasElement[]>(); // fielded image → grouped shape candidates
  for (const group of groups) {
    const members = group.members
      .map((id) => membersById.get(id))
      .filter((member): member is CanvasElement => !!member);
    const image = members.find((member) => member.kind === 'image');
    if (!image) continue; // a plain user grouping, not a screen/automation
    toImage.set(group.id, image.id);
    for (const id of group.members) toImage.set(id, image.id);
    const shapes = members.filter((member) => member.kind === 'shape');
    if (shapes.length > 0) shapesByImage.set(image.id, shapes);
  }

  const resolved = connectors.map((connector) => ({
    ...connector,
    start: connector.start ? toImage.get(connector.start) ?? connector.start : null,
    end: connector.end ? toImage.get(connector.end) ?? connector.end : null,
  }));

  const endpointIds = new Set<string>();
  for (const connector of resolved) {
    if (connector.start) endpointIds.add(connector.start);
    if (connector.end) endpointIds.add(connector.end);
  }

  const elements: FieldedElement[] = [];
  const stickyIds: string[] = [];
  for (const id of endpointIds) {
    // An image endpoint reads from its attached box — but only the shape that
    // carries the fields-box tag counts. A user-drawn shape grouped with the
    // screen must not contribute "fields". Resolved here, per endpoint, so the
    // tag reads stay proportional to connected screens, not to every group.
    const candidates = shapesByImage.get(id);
    const box = candidates ? await fieldsBoxAmong(candidates) : null;
    if (box) {
      const fields = parseBoxFields(box.content);
      if (fields.length > 0) elements.push({ id, fields });
    } else {
      stickyIds.push(id);
    }
  }
  if (stickyIds.length > 0) {
    for (const element of await canvas.get(stickyIds)) {
      const fields = stickyFields(element);
      if (fields.length > 0) elements.push({ id: element.id, fields });
    }
  }

  return { resolved, elements };
}
