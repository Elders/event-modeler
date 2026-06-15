// Generate a model from pasted text. A textarea + button drive the
// `generateModel` feature; a collapsible settings block holds the Anthropic API
// key (stored per-browser, never on the board) and the model picker.

import './GenerateSection.css';
import { useState } from 'react';
import { generateModel } from '../features/generate';
import {
  getPlannerSettings,
  plannerConfigured,
  plannerModels,
  savePlannerSettings,
} from '../features/plannerSettings';
import type { Guard } from './useBusyGuard';

export function GenerateSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const models = plannerModels();
  const [text, setText] = useState('');
  const initial = getPlannerSettings();
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [model, setModel] = useState(initial.model);
  const [configured, setConfigured] = useState(plannerConfigured());
  const [settingsOpen, setSettingsOpen] = useState(!plannerConfigured());

  const persist = (nextKey: string, nextModel: string) => {
    savePlannerSettings({ apiKey: nextKey, model: nextModel });
    setConfigured(nextKey.trim().length > 0);
  };

  const canGenerate = configured && text.trim().length > 0;

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
      />

      <button
        className="button button-primary button-small w-full"
        type="button"
        disabled={busy || !canGenerate}
        onClick={guard(() => generateModel(text))}
      >
        {busy ? 'Generating…' : 'Generate model'}
      </button>

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
