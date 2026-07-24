// The build control shared by both model sources. Three states, driven by
// useGeneration: running (progress + Pause), a paused build on the board (a
// Resume / Discard banner), or idle (the source's primary action). The idle
// label and enablement differ per source ("Generate model" vs "Import model"),
// so they come in as props; everything else is identical.

import './GenerationControls.css';
import type { GenerationCheckpoint } from '../domain/plan';

function resumeLabel(checkpoint: GenerationCheckpoint): string {
  if (!checkpoint.plan) return 'Generation paused before building.';
  const done = checkpoint.progress.slice;
  const total = checkpoint.plan.slices.length;
  return `Generation paused — ${done} of ${total} slice${total === 1 ? '' : 's'} done.`;
}

export function GenerationControls({
  running,
  checkpoint,
  busy,
  idleLabel,
  runningLabel,
  canRun,
  onRun,
  canResume,
  onPause,
  onResume,
  onDiscard,
}: {
  running: boolean;
  checkpoint: GenerationCheckpoint | null;
  busy: boolean;
  idleLabel: string;
  runningLabel: string;
  canRun: boolean;
  onRun: () => void;
  canResume: boolean;
  onPause: () => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  if (running) {
    return (
      <div className="gen-actions">
        <button className="button button-primary button-small gen-grow" type="button" disabled>
          {runningLabel}
        </button>
        <button className="button button-small" type="button" onClick={onPause}>
          Pause
        </button>
      </div>
    );
  }

  if (checkpoint) {
    return (
      <div className="gen-resume">
        <p className="gen-resume-text">{resumeLabel(checkpoint)}</p>
        <div className="gen-actions">
          <button
            className="button button-primary button-small gen-grow"
            type="button"
            disabled={busy || !canResume}
            onClick={onResume}
          >
            Resume
          </button>
          <button className="button button-small" type="button" disabled={busy} onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="button button-primary button-small w-full"
      type="button"
      disabled={busy || !canRun}
      onClick={onRun}
    >
      {idleLabel}
    </button>
  );
}
