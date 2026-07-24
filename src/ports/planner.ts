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
  // The system prompt handed to the planner (the "preamble"). Editable so a
  // user can retune how models are drafted; blank is never stored — a read
  // falls back to `defaultPreamble()` so the planner always has instructions.
  preamble: string;
}

export interface Planner {
  // Produce a model plan from prose. Throws with a user-facing message if the
  // planner is not configured or the request fails. An optional AbortSignal
  // cancels the in-flight request (the generation feature aborts it on Stop).
  // `systemSuffix` is appended to the configured system prompt for this one call
  // — the Figma import uses it to teach how to read its screens+flow input,
  // keeping the shared preamble (and the user's edits to it) in force with no
  // second prompt to maintain. The text path passes nothing.
  plan(text: string, signal?: AbortSignal, systemSuffix?: string): Promise<ModelPlan>;

  // Like `plan`, but from page images (base64 PNG, no data: prefix) plus
  // accompanying text — the PDF/vision import. `systemSuffix` carries the guidance
  // for reading the pages (screens vs. notes, inferred flow). Same schema, same
  // ModelPlan out.
  planFromImages(
    images: string[],
    text: string,
    signal?: AbortSignal,
    systemSuffix?: string,
  ): Promise<ModelPlan>;

  // The built-in model list — what the picker offers before a live list could
  // be fetched (no key configured yet, or the fetch failed).
  models(): PlannerModel[];

  // The built-in preamble (system prompt) — the default a fresh install uses
  // and the value the panel's "reset to default" restores. Like `models()`,
  // it's the adapter's own baked-in copy, exposed so the panel can show and
  // restore it without reaching into the adapter.
  defaultPreamble(): string;

  // The models the configured key can actually use, asked of the provider.
  // Throws with a user-facing message when no key is configured or the
  // provider can't be reached — the caller decides what a failure falls back
  // to, and must say so when it does.
  fetchModels(): Promise<PlannerModel[]>;

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
