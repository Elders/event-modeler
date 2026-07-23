// The built-in Claude model list — what the Generate picker offers before a
// live list could be fetched from the Models API (no key configured yet, or
// the fetch failed; see ./modelList). Model ids are Anthropic-specific, so
// they live in the adapter (not the domain). Opus 4.8 is the default — the
// most capable model for nuanced modeling — with cheaper, faster options
// below it.

import type { PlannerModel } from '../../ports/planner';

export const PLANNER_MODELS: PlannerModel[] = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8 — most capable' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 — balanced' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — fastest, cheapest' },
];

export const DEFAULT_MODEL = PLANNER_MODELS[0].id;

// Adaptive thinking improves the modeling but isn't supported on every model;
// the adapter only requests it where it's available. This id heuristic covers
// the built-in list above — for models picked off the live list, the fetched
// capability answer wins (see AnthropicPlanner.supportsAdaptive).
export function supportsAdaptiveThinking(model: string): boolean {
  return model.startsWith('claude-opus-4') || model === 'claude-sonnet-4-6';
}
