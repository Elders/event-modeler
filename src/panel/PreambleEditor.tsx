// The Generate settings' preamble editor: the system prompt handed to Claude,
// exposed for the user to retune. It defaults to (and resets to) the adapter's
// built-in preamble; an edit persists per-browser alongside the API key. Blank
// is never a meaningful value — the planner falls back to the built-in — so the
// reset control simply restores the default rather than clearing the field.

import './PreambleEditor.css';
import { plannerDefaultPreamble } from '../features/plannerSettings';

export function PreambleEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (preamble: string) => void;
}) {
  const preset = plannerDefaultPreamble();
  const isDefault = value.trim() === preset.trim();

  return (
    <>
      <label className="generate-label" htmlFor="planner-preamble">
        Preamble
      </label>
      <textarea
        id="planner-preamble"
        className="generate-field preamble-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        spellCheck={false}
      />
      {/* Always shown so it's discoverable; disabled when the text already is
          the built-in, so there's nothing to restore. */}
      <button
        type="button"
        className="button button-secondary button-small w-full preamble-reset"
        onClick={() => onChange(preset)}
        disabled={isDefault}
      >
        Reset to default
      </button>
      <p className="footnote">
        The instructions Claude follows when drafting a model. Edit to change how it interprets your
        text.
      </p>
    </>
  );
}
