// Generate a model from pasted text. A textarea + button drive the
// `generateModel` feature; the run/pause/resume machinery is shared with the
// Figma import via useGeneration + GenerationControls (a paused build shows a
// Resume/Discard banner until it's finished, whatever produced it). A
// collapsible settings block holds the Anthropic API key (stored per-browser,
// never on the board), the model picker, and the editable preamble.

import './GenerateSection.css';
import { useEffect, useState } from 'react';
import { failureReason, reportToLog } from '../features/diagnostics';
import { generateModel } from '../features/generate';
import {
  getPlannerSettings,
  isPlannerConfigured,
  plannerDefaultPreamble,
  plannerModels,
  savePlannerSettings,
} from '../features/plannerSettings';
import type { PlannerSettings } from '../ports/planner';
import { GenerationControls } from './GenerationControls';
import { ModelPicker } from './ModelPicker';
import { PreambleEditor } from './PreambleEditor';
import type { Guard } from './useBusyGuard';
import { useGeneration } from './useGeneration';

// The stored settings, or the reason they couldn't be read. Reading them can
// fail (storage blocked, or the stored value unreadable), and a failure must not
// render as "you have no API key" — the user would conclude their key vanished.
type SettingsLoad = { ok: true; settings: PlannerSettings } | { ok: false; error: unknown };

function loadSettings(): SettingsLoad {
  try {
    return { ok: true, settings: getPlannerSettings() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function GenerateSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const models = plannerModels();
  const [text, setText] = useState('');

  // Read the store exactly once, capturing any failure instead of letting it
  // escape a render and take the tab down. A lazy initialiser, so there's no
  // flash of "no key" before an effect fills it in; StrictMode may run it twice,
  // which is two harmless reads — the report below happens once.
  const [load] = useState<SettingsLoad>(loadSettings);
  useEffect(() => {
    if (!load.ok) reportToLog('Could not read the saved planner settings', load.error);
  }, [load]);

  const stored = load.ok ? load.settings : null;
  const [apiKey, setApiKey] = useState(stored?.apiKey ?? '');
  const [model, setModel] = useState(stored?.model ?? models[0]?.id ?? '');
  const [preamble, setPreamble] = useState(stored?.preamble ?? plannerDefaultPreamble());
  const [configured, setConfigured] = useState(!!stored && isPlannerConfigured(stored));
  // Open the settings when there's nothing usable in there — including when the
  // read failed, since re-entering the key is how the user gets out of that.
  const [settingsOpen, setSettingsOpen] = useState(!configured);
  // Set when a save didn't stick. Silence here was the worse of the two lies:
  // the key looked accepted and simply wasn't there next time.
  const [saveError, setSaveError] = useState<string | null>(null);

  const { checkpoint, running, run, onResume, onPause, onDiscard } = useGeneration(guard);

  const persist = (next: PlannerSettings) => {
    try {
      savePlannerSettings(next);
      setConfigured(next.apiKey.trim().length > 0);
      setSaveError(null);
    } catch (error) {
      // `configured` is deliberately left alone: the planner re-reads the store
      // when it runs, so whatever was there before is still what it will use.
      // Claiming this key took effect would be the same lie one layer up.
      reportToLog('Could not save the planner settings', error);
      setSaveError(failureReason(error));
    }
  };

  const canGenerate = configured && text.trim().length > 0;
  const onGenerate = run((signal) => generateModel(text, signal));

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

      <GenerationControls
        running={running}
        checkpoint={checkpoint}
        busy={busy}
        idleLabel="Generate model"
        runningLabel="Generating…"
        canRun={canGenerate}
        onRun={onGenerate}
        canResume={configured}
        onPause={onPause}
        onResume={onResume}
        onDiscard={onDiscard}
      />

      {!configured && load.ok && (
        <p className="footnote">Add your Anthropic API key in settings below to enable this.</p>
      )}

      {/* Sync state from the native toggle (fires after the open state has
          already flipped), not from a summary onClick. React 19 flushes a
          click-handler state update synchronously and rewrites `open` before
          the browser's own default toggle runs, so the two cancel out and the
          first click appears to do nothing. onToggle just reflects reality. */}
      <details
        className="generate-settings"
        open={settingsOpen}
        onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
      >
        <summary>Settings</summary>

        {/* The read failed. Say that — an empty key field on its own reads as
            "you never set one", and the user would go looking for a key they
            already have. The form stays usable: re-entering it is the way out,
            and if writing is broken too the save error below will say so. */}
        {!load.ok && (
          <p className="generate-settings-error">
            Couldn't read your saved settings — {failureReason(load.error)}. Your key may still
            be there; re-enter it to carry on.
          </p>
        )}

        {saveError && (
          <p className="generate-settings-error">Not saved — {saveError}. Nothing was stored.</p>
        )}

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
            persist({ apiKey: e.target.value, model, preamble });
          }}
        />
        <p className="footnote">
          Stored only in this browser, never on the board. Get a key at{' '}
          <a href="https://platform.claude.com" target="_blank" rel="noreferrer">
            platform.claude.com
          </a>
          .
        </p>

        <ModelPicker
          value={model}
          configured={configured}
          onChange={(next) => {
            setModel(next);
            persist({ apiKey, model: next, preamble });
          }}
        />

        <PreambleEditor
          value={preamble}
          onChange={(next) => {
            setPreamble(next);
            persist({ apiKey, model, preamble: next });
          }}
        />
      </details>
    </section>
  );
}
