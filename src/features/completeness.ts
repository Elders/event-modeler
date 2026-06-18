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
import { FLAGS_KEY, type ConnectorFlag } from '../domain/records';
import { services } from '../services';
import { readFieldRecords } from './fields/model';

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
  const flaggedNow = incompleteConnectors(elements, connectors);

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
