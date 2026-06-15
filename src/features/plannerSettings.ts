// Thin panel-facing wrappers over the Planner's own configuration, so the panel
// reads and writes the API key and model choice through a feature rather than
// reaching into the adapter.

import type { PlannerModel, PlannerSettings } from '../ports/planner';
import { requirePlanner } from './helpers';

export function plannerModels(): PlannerModel[] {
  return requirePlanner().models();
}

export function getPlannerSettings(): PlannerSettings {
  return requirePlanner().getSettings();
}

export function savePlannerSettings(settings: PlannerSettings): void {
  requirePlanner().setSettings(settings);
}

export function plannerConfigured(): boolean {
  return requirePlanner().isConfigured();
}
