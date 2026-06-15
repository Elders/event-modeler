// The Planner port: turns a block of prose into a ModelPlan. It is the seam
// behind the "generate a model from text" feature — the Claude adapter is one
// implementation; any other LLM (or a deterministic parser) could be another.
//
// The port also owns its own configuration (the API key and model choice),
// because those are exactly the things a Planner needs and nothing else does.
// How they are stored is an adapter concern; the panel reads and writes them
// through a feature, never touching the adapter directly.

import type { ModelPlan } from '../domain/plan';

// One selectable model: a stable id plus a human label for the picker.
export interface PlannerModel {
  id: string;
  label: string;
}

export interface PlannerSettings {
  apiKey: string;
  model: string;
}

export interface Planner {
  // Produce a model plan from prose. Throws with a user-facing message if the
  // planner is not configured or the request fails.
  plan(text: string): Promise<ModelPlan>;

  // The models the user may choose between.
  models(): PlannerModel[];

  // Current configuration, and a way to persist a change to it.
  getSettings(): PlannerSettings;
  setSettings(settings: PlannerSettings): void;

  // Whether the planner has everything it needs to run (i.e. an API key).
  isConfigured(): boolean;
}
