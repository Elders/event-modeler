// Import from PDF: a file picker drives `importFromPdf`, which renders the pages
// and asks Claude to read them (vision). Shares the run/pause/resume machinery
// with the other AI sources (useGeneration + GenerationControls) and needs only
// the Anthropic key — the PDF is a local upload, no Figma token. The key/model
// are the same per-browser planner settings the other sources use.

import './ImportPdfSection.css';
// The shared model picker uses the planner form's label/field classes.
import './GenerateSection.css';
import { useEffect, useState } from 'react';
import { failureReason, reportToLog } from '../features/diagnostics';
import { importFromPdf } from '../features/importPdf';
import {
  getPlannerSettings,
  isPlannerConfigured,
  plannerModels,
  savePlannerSettings,
} from '../features/plannerSettings';
import type { PlannerSettings } from '../ports/planner';
import { GenerationControls } from './GenerationControls';
import { ModelPicker } from './ModelPicker';
import type { Guard } from './useBusyGuard';
import { useGeneration } from './useGeneration';

type PlannerLoad = { ok: true; settings: PlannerSettings } | { ok: false; error: unknown };

function loadPlanner(): PlannerLoad {
  try {
    return { ok: true, settings: getPlannerSettings() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function ImportPdfSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const [file, setFile] = useState<File | null>(null);

  const [load] = useState<PlannerLoad>(loadPlanner);
  useEffect(() => {
    if (!load.ok) reportToLog('Could not read the saved planner settings', load.error);
  }, [load]);

  const stored = load.ok ? load.settings : null;
  const [apiKey, setApiKey] = useState(stored?.apiKey ?? '');
  const [model, setModel] = useState(stored?.model ?? plannerModels()[0]?.id ?? '');
  const [configured, setConfigured] = useState(!!stored && isPlannerConfigured(stored));
  const [settingsOpen, setSettingsOpen] = useState(!configured);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { checkpoint, running, run, onResume, onPause, onDiscard } = useGeneration(guard);

  const persist = (nextKey: string, nextModel: string) => {
    try {
      savePlannerSettings({ ...getPlannerSettings(), apiKey: nextKey, model: nextModel });
      setConfigured(nextKey.trim().length > 0);
      setSaveError(null);
    } catch (error) {
      reportToLog('Could not save the planner settings', error);
      setSaveError(failureReason(error));
    }
  };

  const canImport = configured && !!file;
  const onImport = run(async (signal) => {
    if (!file) return;
    const data = await file.arrayBuffer();
    await importFromPdf(data, signal);
  });

  return (
    <section className="section">
      <h2 className="section-title">Import from PDF</h2>
      <p className="section-sub">Upload exported design pages — an AI agent reads them into a model</p>

      <input
        className="pdf-input"
        type="file"
        accept="application/pdf,.pdf"
        disabled={running}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <GenerationControls
        running={running}
        checkpoint={checkpoint}
        busy={busy}
        idleLabel="Import model"
        runningLabel="Reading pages…"
        canRun={canImport}
        onRun={onImport}
        canResume={configured}
        onPause={onPause}
        onResume={onResume}
        onDiscard={onDiscard}
      />

      {!configured && load.ok && (
        <p className="footnote">Add your Anthropic API key in settings below to enable this.</p>
      )}

      <details
        className="pdf-settings"
        open={settingsOpen}
        onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
      >
        <summary>Settings</summary>

        {!load.ok && (
          <p className="pdf-settings-error">
            Couldn't read your saved settings — {failureReason(load.error)}. Your key may still be
            there; re-enter it to carry on.
          </p>
        )}
        {saveError && (
          <p className="pdf-settings-error">Not saved — {saveError}. Nothing was stored.</p>
        )}

        <label className="pdf-label" htmlFor="pdf-anthropic-key">
          Anthropic API key
        </label>
        <input
          id="pdf-anthropic-key"
          className="pdf-field"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            persist(e.target.value, model);
          }}
        />
        <p className="footnote">
          Shared with the other AI sources. Reading pages uses vision — pick a capable model below.
        </p>

        <ModelPicker
          value={model}
          configured={configured}
          onChange={(next) => {
            setModel(next);
            persist(apiKey, next);
          }}
        />
      </details>
    </section>
  );
}
