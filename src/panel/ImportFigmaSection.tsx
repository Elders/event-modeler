// Import from Figma: a file-URL input drives `importFromFigma`, which reads the
// file's screens and click-through flow and asks the same Planner to draft a
// model — so the run/pause/resume machinery is shared with the text generator
// (useGeneration + GenerationControls). It needs BOTH credentials: the Figma
// token (to read the file) and the Anthropic key (the AI drafts the model), so
// its settings surface both. The key is the *same* per-browser planner setting
// the text generator uses; editing it here or there is one value.

import './ImportFigmaSection.css';
// The shared model picker is authored against the planner form's label/field
// classes (generate-label / generate-field), so bring that stylesheet in too —
// the Figma section can be the first thing mounted, before the text section.
import './GenerateSection.css';
import { useEffect, useState } from 'react';
import { failureReason, reportToLog } from '../features/diagnostics';
import { getFigmaSettings, isFigmaConfigured, saveFigmaSettings } from '../features/figmaSettings';
import { importFromFigma } from '../features/importFigma';
import {
  getPlannerSettings,
  isPlannerConfigured,
  plannerModels,
  savePlannerSettings,
} from '../features/plannerSettings';
import type { DesignSourceSettings } from '../ports/designSource';
import type { PlannerSettings } from '../ports/planner';
import { GenerationControls } from './GenerationControls';
import { ModelPicker } from './ModelPicker';
import type { Guard } from './useBusyGuard';
import { useGeneration } from './useGeneration';

// Stored settings, or the reason they couldn't be read — a failure must never
// render as "not configured" (the codebase's #1 rule), for either credential.
type FigmaLoad = { ok: true; settings: DesignSourceSettings } | { ok: false; error: unknown };
type PlannerLoad = { ok: true; settings: PlannerSettings } | { ok: false; error: unknown };

function loadFigma(): FigmaLoad {
  try {
    return { ok: true, settings: getFigmaSettings() };
  } catch (error) {
    return { ok: false, error };
  }
}

function loadPlanner(): PlannerLoad {
  try {
    return { ok: true, settings: getPlannerSettings() };
  } catch (error) {
    return { ok: false, error };
  }
}

export function ImportFigmaSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const [url, setUrl] = useState('');

  // Read each store exactly once, capturing any failure instead of letting it
  // escape a render (lazy initialisers; StrictMode may run them twice, which is
  // harmless — the report below fires once).
  const [figmaLoad] = useState<FigmaLoad>(loadFigma);
  const [plannerLoad] = useState<PlannerLoad>(loadPlanner);
  useEffect(() => {
    if (!figmaLoad.ok) reportToLog('Could not read the saved Figma settings', figmaLoad.error);
    if (!plannerLoad.ok) reportToLog('Could not read the saved planner settings', plannerLoad.error);
  }, [figmaLoad, plannerLoad]);

  const figmaStored = figmaLoad.ok ? figmaLoad.settings : null;
  const plannerStored = plannerLoad.ok ? plannerLoad.settings : null;

  const [token, setToken] = useState(figmaStored?.token ?? '');
  const [apiKey, setApiKey] = useState(plannerStored?.apiKey ?? '');
  // The model is the *same* per-browser planner setting the text generator uses,
  // so the two dropdowns are one choice — set here, it's what a text generation
  // uses too, and vice versa.
  const [model, setModel] = useState(plannerStored?.model ?? plannerModels()[0]?.id ?? '');
  const [figmaConfigured, setFigmaConfigured] = useState(
    !!figmaStored && isFigmaConfigured(figmaStored),
  );
  const [plannerConfigured, setPlannerConfigured] = useState(
    !!plannerStored && isPlannerConfigured(plannerStored),
  );

  // Open settings when either credential is missing (or a read failed — the way
  // out is re-entering it).
  const [settingsOpen, setSettingsOpen] = useState(!(figmaConfigured && plannerConfigured));
  const [saveError, setSaveError] = useState<string | null>(null);

  const { checkpoint, running, run, onResume, onPause, onDiscard } = useGeneration(guard);

  const persistFigma = (nextToken: string) => {
    try {
      // Preserve any proxyUrl already stored (unused in the client-side path).
      const next: DesignSourceSettings = {
        token: nextToken,
        ...(figmaStored?.proxyUrl ? { proxyUrl: figmaStored.proxyUrl } : {}),
      };
      saveFigmaSettings(next);
      setFigmaConfigured(nextToken.trim().length > 0);
      setSaveError(null);
    } catch (error) {
      // Leave `figmaConfigured` alone: the adapter re-reads the store when it
      // runs, so whatever was there is still what it will use.
      reportToLog('Could not save the Figma settings', error);
      setSaveError(failureReason(error));
    }
  };

  // Write the shared planner settings (key + model), reading the store fresh so
  // the preamble the text generator manages is preserved rather than clobbered
  // with a stale copy. Both the key and the model dropdown route through here, so
  // either edit lands in the one setting both sources read.
  const persistPlanner = (nextKey: string, nextModel: string) => {
    try {
      savePlannerSettings({ ...getPlannerSettings(), apiKey: nextKey, model: nextModel });
      setPlannerConfigured(nextKey.trim().length > 0);
      setSaveError(null);
    } catch (error) {
      reportToLog('Could not save the planner settings', error);
      setSaveError(failureReason(error));
    }
  };

  const canImport = figmaConfigured && plannerConfigured && url.trim().length > 0;
  const onImport = run((signal) => importFromFigma(url, signal));

  const readFailed = !figmaLoad.ok || !plannerLoad.ok;
  const readError: unknown = !figmaLoad.ok ? figmaLoad.error : plannerLoad.ok ? null : plannerLoad.error;

  return (
    <section className="section">
      <h2 className="section-title">Import from Figma</h2>
      <p className="section-sub">Paste a Figma file link — its screens and flow draft the model</p>

      <input
        className="figma-input"
        type="url"
        autoComplete="off"
        placeholder="https://www.figma.com/design/…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={running}
      />

      <GenerationControls
        running={running}
        checkpoint={checkpoint}
        busy={busy}
        idleLabel="Import model"
        runningLabel="Importing…"
        canRun={canImport}
        onRun={onImport}
        canResume={plannerConfigured}
        onPause={onPause}
        onResume={onResume}
        onDiscard={onDiscard}
      />

      {(!figmaConfigured || !plannerConfigured) && figmaLoad.ok && plannerLoad.ok && (
        <p className="footnote">
          Needs both a Figma token and an Anthropic API key — add them in settings below.
        </p>
      )}

      <details
        className="figma-settings"
        open={settingsOpen}
        onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
      >
        <summary>Settings</summary>

        {readFailed && (
          <p className="figma-settings-error">
            Couldn't read your saved settings — {failureReason(readError)}. They may still be
            there; re-enter to carry on.
          </p>
        )}
        {saveError && (
          <p className="figma-settings-error">Not saved — {saveError}. Nothing was stored.</p>
        )}

        <label className="figma-label" htmlFor="figma-token">
          Figma access token
        </label>
        <input
          id="figma-token"
          className="figma-field"
          type="password"
          autoComplete="off"
          placeholder="figd_…"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            persistFigma(e.target.value);
          }}
        />
        <p className="footnote">
          Stored only in this browser, never on the board. Create one at Figma → Settings →
          Security with the read-only <code>file_content:read</code> scope.
        </p>

        <label className="figma-label" htmlFor="figma-anthropic-key">
          Anthropic API key
        </label>
        <input
          id="figma-anthropic-key"
          className="figma-field"
          type="password"
          autoComplete="off"
          placeholder="sk-ant-…"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            persistPlanner(e.target.value, model);
          }}
        />
        <p className="footnote">
          Shared with the text generator — the AI that drafts the model from your screens.
        </p>

        <ModelPicker
          value={model}
          configured={plannerConfigured}
          onChange={(next) => {
            setModel(next);
            persistPlanner(apiKey, next);
          }}
        />
      </details>
    </section>
  );
}
