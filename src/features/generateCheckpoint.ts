// Persistence for an in-progress model generation, so an interrupted build can
// resume. The checkpoint lives in the document (Store port → board app data), so
// it survives a panel close or a board reload. It is saved after each completed
// unit (slice / link / spec) and cleared when the build finishes or is discarded.

import type { GenerationCheckpoint } from '../domain/plan';
import { GEN_CHECKPOINT_KEY } from '../domain/records';
import { services } from '../services';

// Reads the checkpoint, returning null when absent or malformed. Cleared
// checkpoints are written as `{}` (see clearCheckpoint), which fails this guard.
export async function loadCheckpoint(): Promise<GenerationCheckpoint | null> {
  const raw = await services().store.read<unknown>(GEN_CHECKPOINT_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const cp = raw as Partial<GenerationCheckpoint>;
  // Validate the current shape; a checkpoint written by an older build (or a
  // cleared `{}`) fails this and is treated as absent.
  if (
    typeof cp.text !== 'string' ||
    !cp.origin ||
    !cp.refToId ||
    typeof cp.progress?.slice !== 'number' ||
    !Array.isArray(cp.pendingFields)
  ) {
    return null;
  }
  return cp as GenerationCheckpoint;
}

export async function saveCheckpoint(checkpoint: GenerationCheckpoint): Promise<void> {
  await services().store.write(GEN_CHECKPOINT_KEY, { ...checkpoint, savedAt: Date.now() });
}

// Clears by writing an empty object rather than null — board app data reliably
// accepts an object, and loadCheckpoint treats it as absent.
export async function clearCheckpoint(): Promise<void> {
  await services().store.write(GEN_CHECKPOINT_KEY, {});
}

// Drops a checkpoint left behind by an abandoned generation — one not resumed
// within `maxAgeMs` — so its plan/refToId can't occupy the board's app-data
// budget indefinitely. A recent checkpoint (a deliberate pause, a reload mid-run)
// is left intact so it can still be resumed. Best-effort, runs once on load.
export async function clearStaleCheckpoint(maxAgeMs: number): Promise<void> {
  const cp = await loadCheckpoint();
  if (!cp) return;
  if (typeof cp.savedAt === 'number' && Date.now() - cp.savedAt < maxAgeMs) return;
  await clearCheckpoint();
}

export async function hasCheckpoint(): Promise<boolean> {
  return (await loadCheckpoint()) !== null;
}
