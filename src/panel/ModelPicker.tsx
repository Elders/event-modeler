// The Generate settings' model picker. Once an API key is configured the list
// is fetched live from the Models API (newest first, filtered to models that
// can hold the plan schema); until then — and when the fetch fails — it shows
// the built-in catalog. A failed fetch keeps the picker usable and says so,
// both here and in the Console tab.

import './ModelPicker.css';
import { useEffect, useState } from 'react';
import { loadPlannerModels } from '../features/plannerModels';
import { plannerModels } from '../features/plannerSettings';
import type { PlannerModel } from '../ports/planner';

export function ModelPicker({
  value,
  configured,
  onChange,
}: {
  value: string;
  configured: boolean;
  onChange: (model: string) => void;
}) {
  const [models, setModels] = useState<PlannerModel[]>(plannerModels);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  // Fetch when a key appears (or on mount if one is already saved). Keyed on
  // `configured`, not the key text: the key field persists per keystroke, and
  // refetching on each one would hammer the API for nothing.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void loadPlannerModels().then((load) => {
      if (cancelled) return;
      setModels(load.models);
      setFallbackReason(load.fallbackReason);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  return (
    <>
      <label className="generate-label" htmlFor="planner-model">
        Model
      </label>
      <select
        id="planner-model"
        className="generate-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
        {/* A saved model the current list doesn't offer must still display
            truthfully — a <select> whose value matches no option shows blank. */}
        {value && !models.some((m) => m.id === value) && <option value={value}>{value}</option>}
      </select>
      {fallbackReason && (
        <p className="model-picker-error">
          Couldn't fetch the live model list — {fallbackReason}. Showing the built-in list; details
          in the Console tab.
        </p>
      )}
    </>
  );
}
