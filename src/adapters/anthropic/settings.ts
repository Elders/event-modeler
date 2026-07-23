// Planner configuration storage: the browser's localStorage, scoped to this
// machine. The API key is a per-user secret, so it must NOT go into board app
// data (the Store port) — that travels with the document and is shared with
// everyone on the board. localStorage keeps it private to this browser.
//
// Neither call catches. "Nothing stored yet" is a real answer and returns the
// defaults; a storage failure or unreadable data is not. Reporting the second as
// the first says "you have no API key" when the truth is we couldn't read it —
// the same fabrication that made a rate-limited board look like an empty one
// (see DECISIONS.md). The swallowed *write* was worse: the user typed their key,
// was told nothing, and it never persisted.

import type { PlannerSettings } from '../../ports/planner';
import { DEFAULT_MODEL } from './models';
import { SYSTEM_PROMPT } from './prompt';

const KEY = 'em.planner';

export function readSettings(): PlannerSettings {
  const raw = localStorage.getItem(KEY);
  // Never configured. A real answer, not a guess.
  if (!raw) return { apiKey: '', model: DEFAULT_MODEL, preamble: SYSTEM_PROMPT };
  // Unreadable stored data throws rather than resetting to the defaults: the
  // caller can offer to re-enter the key, which silently pretending it was never
  // there cannot.
  const parsed = JSON.parse(raw) as Partial<PlannerSettings>;
  return {
    apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL,
    // A blank or absent preamble means "use the built-in" — the planner can't
    // run on an empty system prompt, so a customised value is stored but an
    // emptied one falls back rather than persisting a broken state.
    preamble:
      typeof parsed.preamble === 'string' && parsed.preamble.trim()
        ? parsed.preamble
        : SYSTEM_PROMPT,
  };
}

export function writeSettings(settings: PlannerSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
