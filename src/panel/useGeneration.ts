// Shared build-engine glue for the two model sources — text generation and Figma
// import. Both drive the same build engine and the same on-board checkpoint, so
// a paused build resumes the same way whatever produced it: this hook is that one
// shared behaviour (the persisted checkpoint, the running flag, the abort
// controller, and run/pause/resume/discard), mounted by whichever source section
// is currently showing.

import { useEffect, useRef, useState } from 'react';
import type { GenerationCheckpoint } from '../domain/plan';
import { resumeGeneration } from '../features/generate';
import { clearCheckpoint, loadCheckpoint } from '../features/generateCheckpoint';
import type { Guard } from './useBusyGuard';

export function useGeneration(guard: Guard) {
  // A paused build persisted on the board (null = none), and whether *our* run is
  // currently active. The abort controller is held across renders so Pause can
  // reach it while the guarded run is in flight.
  const [checkpoint, setCheckpoint] = useState<GenerationCheckpoint | null>(null);
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const refreshCheckpoint = () => void loadCheckpoint().then(setCheckpoint);
  useEffect(refreshCheckpoint, []);

  // Wrap a run in the shared busy guard (locks the rest of the panel, toasts real
  // errors), plus our own running state and a fresh abort controller. Pause is
  // deliberately NOT guarded — it just trips the controller.
  const run = (action: (signal: AbortSignal) => Promise<void>) =>
    guard(async () => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setRunning(true);
      try {
        await action(controller.signal);
      } finally {
        controllerRef.current = null;
        setRunning(false);
        refreshCheckpoint();
      }
    });

  const onResume = run((signal) => resumeGeneration(signal));
  const onPause = () => controllerRef.current?.abort();
  const onDiscard = () => void clearCheckpoint().then(refreshCheckpoint);

  return { checkpoint, running, run, onResume, onPause, onDiscard };
}
