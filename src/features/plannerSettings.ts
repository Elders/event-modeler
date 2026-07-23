// Thin panel-facing wrappers over the Planner's own configuration, so the panel
// reads and writes the API key and model choice through a feature rather than
// reaching into the adapter.

import type { PlannerModel, PlannerSettings } from '../ports/planner';
import { requirePlanner } from './helpers';

export function plannerModels(): PlannerModel[] {
  return requirePlanner().models();
}

// The built-in preamble the settings editor starts from and resets to.
export function plannerDefaultPreamble(): string {
  return requirePlanner().defaultPreamble();
}

// Both throw if the settings store can't be reached; the panel is the only
// caller and has somewhere to say so. See ports/planner for why there is no
// separate "is it configured?" read.
export function getPlannerSettings(): PlannerSettings {
  return requirePlanner().getSettings();
}

export function savePlannerSettings(settings: PlannerSettings): void {
  requirePlanner().setSettings(settings);
}

// Whether these settings are enough to run a generation. Derived, not re-read.
export function isPlannerConfigured(settings: PlannerSettings): boolean {
  return settings.apiKey.trim().length > 0;
}
