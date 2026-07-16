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
  // planner is not configured or the request fails. An optional AbortSignal
  // cancels the in-flight request (the generation feature aborts it on Stop).
  plan(text: string, signal?: AbortSignal): Promise<ModelPlan>;

  // The models the user may choose between.
  models(): PlannerModel[];

  // Current configuration, and a way to persist a change to it. Both THROW if
  // the store can't be reached: an empty key means the user hasn't set one, and
  // a silent `setSettings` means it saved — neither may be said on a guess.
  //
  // There is deliberately no `isConfigured()`. It existed, and read the store a
  // second time to answer what `getSettings()` already knows — a second read is
  // a second place to decide what a failure means, which is how these lies get
  // in. Callers derive it: `getSettings().apiKey.trim() !== ''`.
  getSettings(): PlannerSettings;
  setSettings(settings: PlannerSettings): void;
}
