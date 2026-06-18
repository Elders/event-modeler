// The information-completeness pass, run from the headless board script: it
// validates that every field-bearing element has its fields provided by the
// elements pointing into it, reddening each individual arrow whose source
// doesn't carry all of the target's fields (matched by name and type). There
// are no connector events, so it polls — the reddening is reconciled against a
// registry of flagged connectors so a closed gap restores the arrow to the
// exact color it had before.
//
// Fields come from the field registry (the tool's canonical store), so the
// check reflects whatever the panel has synced.

import { incompleteConnectors, type FieldedElement } from '../domain/completeness';
import { FLAGS_KEY, type ConnectorFlag, type FieldRecord } from '../domain/records';
import type { CanvasConnector } from '../ports/canvas';
import { services } from '../services';
import { displayMode, readFieldRecords } from './fields/model';

// Miro's red; the default we fall back to if a flagged connector somehow had no
// stroke color to remember.
const INCOMPLETE_COLOR = '#F24726';
const DEFAULT_CONNECTOR_COLOR = '#1a1a1a';

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

  const records = await readFieldRecords();
  const elements: FieldedElement[] = records.map((record) => ({
    id: record.element,
    fields: record.fields,
  }));
  // A screen/automation is a group, so a connector attaches to the group (or its
  // title/box member) rather than the image that holds the fields. Resolve those
  // endpoints back to the fielded element before checking, or the arrow could
  // never see the source's fields and would stay red forever.
  const resolved = await resolveGroupedEndpoints(connectors, records);
  const flaggedNow = incompleteConnectors(elements, resolved);

  const byId = new Map(connectors.map((connector) => [connector.id, connector]));
  const previously = new Set(flags.map((flag) => flag.connector));
  const kept: ConnectorFlag[] = [];
  let changed = false;

  // Restore connectors that are no longer incomplete (or were deleted).
  for (const flag of flags) {
    const live = byId.get(flag.connector);
    if (live && flaggedNow.has(flag.connector)) {
      kept.push(flag); // still incomplete — leave it red, keep its original color
      continue;
    }
    if (live) await canvas.setConnectorColor(flag.connector, flag.original);
    changed = true;
  }

  // Redden connectors that became incomplete, remembering their prior color.
  for (const id of flaggedNow) {
    if (previously.has(id)) continue;
    const live = byId.get(id);
    if (!live) continue;
    await canvas.setConnectorColor(id, INCOMPLETE_COLOR);
    kept.push({ connector: id, original: live.color ?? DEFAULT_CONNECTOR_COLOR });
    changed = true;
  }

  if (changed) await store.write(FLAGS_KEY, kept);
}

// Rewrites connector endpoints that land on a grouped element so they point at
// the group member that carries the fields. A screen or automation is a
// title + image + box group; a connector can attach to the group id or to any
// member, none of which is the image the field record is keyed by. Mapping the
// group id and every member to the fielded member makes such connectors match.
// Only box-display blocks (screens, automations) are grouped, so this is skipped
// when none are present.
async function resolveGroupedEndpoints(
  connectors: CanvasConnector[],
  records: FieldRecord[],
): Promise<CanvasConnector[]> {
  if (!records.some((record) => displayMode(record.type) === 'box')) return connectors;
  const fielded = new Set(records.map((record) => record.element));
  const groups = await services().canvas.groups();
  const resolve = new Map<string, string>();
  for (const group of groups) {
    const target = group.members.find((member) => fielded.has(member));
    if (!target) continue;
    resolve.set(group.id, target);
    for (const member of group.members) resolve.set(member, target);
  }
  if (resolve.size === 0) return connectors;
  return connectors.map((connector) => ({
    ...connector,
    start: connector.start ? resolve.get(connector.start) ?? connector.start : null,
    end: connector.end ? resolve.get(connector.end) ?? connector.end : null,
  }));
}
