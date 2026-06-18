// Generate a model from pasted text. A textarea + button drive the
// `generateModel` feature; generation can be paused mid-build and resumed —
// a paused build (interrupted by Pause, a reload, or a failure) is persisted on
// the board, so a banner offers Resume/Discard until it's finished. A
// collapsible settings block holds the Anthropic API key (stored per-browser,
// never on the board) and the model picker.

import './GenerateSection.css';
import { useEffect, useRef, useState } from 'react';
import type { GenerationCheckpoint } from '../domain/plan';
import { generateModel, resumeGeneration } from '../features/generate';
import { clearCheckpoint, loadCheckpoint } from '../features/generateCheckpoint';
import {
  getPlannerSettings,
  plannerConfigured,
  plannerModels,
  savePlannerSettings,
} from '../features/plannerSettings';
import type { Guard } from './useBusyGuard';

function resumeLabel(checkpoint: GenerationCheckpoint): string {
  if (!checkpoint.plan) return 'Generation paused before building.';
  const done = checkpoint.progress.slice;
  const total = checkpoint.plan.slices.length;
  return `Generation paused — ${done} of ${total} slice${total === 1 ? '' : 's'} done.`;
}

export function GenerateSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const models = plannerModels();
  const [text, setText] = useState('');
  const initial = getPlannerSettings();
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [configured, setConfigured] = useState(plannerConfigured());
  const [settingsOpen, setSettingsOpen] = useState(!plannerConfigured());

  // A paused build persisted on the board (null = none), and whether *our* run
  // is currently active. The abort controller is held across renders so Stop can
  // reach it while the guarded run is in flight.
  const [checkpoint, setCheckpoint] = useState<GenerationCheckpoint | null>(null);
  const [running, setRunning] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const refreshCheckpoint = () => void loadCheckpoint().then(setCheckpoint);
  useEffect(refreshCheckpoint, []);

  const persist = (nextKey: string, nextModel: string) => {
    savePlannerSettings({ apiKey: nextKey, model: nextModel });
    setConfigured(nextKey.trim().length > 0);
  };

  const canGenerate = configured && text.trim().length > 0;

  // Wrap a run in the shared busy guard (so the rest of the panel is locked and
  // real errors toast), plus our own running state + a fresh abort controller.
  // Pause is deliberately NOT guarded — it just trips the controller.
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

  const onGenerate = run((signal) => generateModel(text, signal));
  const onResume = run((signal) => resumeGeneration(signal));
  const onPause = () => controllerRef.current?.abort();
  const onDiscard = () => void clearCheckpoint().then(refreshCheckpoint);

  return (
    <section className="section">
      <h2 className="section-title">Generate from text</h2>
      <p className="section-sub">Paste a description — an AI agent drafts the model</p>

      <textarea
        className="generate-input"
        placeholder="Describe a system or workflow — e.g. “A customer places an order, payment is taken, the order is shipped…”"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={running}
      />

      {running ? (
        <div className="generate-actions">
          <button className="button button-primary button-small generate-grow" type="button" disabled>
            Generating…
          </button>
          <button className="button button-small" type="button" onClick={onPause}>
            Pause
          </button>
        </div>
      ) : checkpoint ? (
        <div className="generate-resume">
          <p className="generate-resume-text">{resumeLabel(checkpoint)}</p>
          <div className="generate-actions">
            <button
              className="button button-primary button-small generate-grow"
              type="button"
              disabled={busy || !configured}
              onClick={onResume}
            >
              Resume
            </button>
            <button className="button button-small" type="button" disabled={busy} onClick={onDiscard}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <button
          className="button button-primary button-small w-full"
          type="button"
          disabled={busy || !canGenerate}
          onClick={onGenerate}
        >
          Generate model
        </button>
      )}

      {!configured && (
        <p className="footnote">Add your Anthropic API key in settings below to enable this.</p>
      )}

      <details className="generate-settings" open={settingsOpen}>
        <summary onClick={() => setSettingsOpen((v) => !v)}>Settings</summary>

        <label className="generate-label" htmlFor="planner-key">
          Anthropic API key
        </label>
        <input
          id="planner-key"
          className="generate-field"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            persist(e.target.value, model);
          }}
        />

        <label className="generate-label" htmlFor="planner-model">
          Model
        </label>
        <select
          id="planner-model"
          className="generate-field"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            persist(apiKey, e.target.value);
          }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <p className="footnote">
          Stored only in this browser, never on the board. Get a key at console.anthropic.com.
        </p>
      </details>
    </section>
  );
}
