// Planner configuration storage: the browser's localStorage, scoped to this
// machine. The API key is a per-user secret, so it must NOT go into board app
// data (the Store port) — that travels with the document and is shared with
// everyone on the board. localStorage keeps it private to this browser.

import type { PlannerSettings } from '../../ports/planner';
import { DEFAULT_MODEL } from './models';

const KEY = 'em.planner';

export function readSettings(): PlannerSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlannerSettings>;
      return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL,
      };
    }
  } catch (error) {
    console.warn('Could not read planner settings', error);
  }
  return { apiKey: '', model: DEFAULT_MODEL };
}

export function writeSettings(settings: PlannerSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not save planner settings', error);
  }
}
