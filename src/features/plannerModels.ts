// The Generate picker's model list: fetched live from the provider when a key
// is configured, with the built-in catalog as the explicit fallback. The load
// never throws — a failure is reported to the Console and returned as the
// reason the fallback is showing, so the picker always has both a list to
// render and the truth about where it came from.

import type { PlannerModel } from '../ports/planner';
import { services } from '../services';
import { failureReason } from './diagnostics';
import { requirePlanner } from './helpers';

export interface PlannerModelsLoad {
  models: PlannerModel[];
  // Why `models` is the built-in list instead of the live one; null when live.
  fallbackReason: string | null;
}

export async function loadPlannerModels(): Promise<PlannerModelsLoad> {
  const planner = requirePlanner();
  try {
    const models = await planner.fetchModels();
    if (models.length > 0) return { models, fallbackReason: null };
    // The provider answered, but with nothing a picker could offer — an
    // answer, not a failure, yet an empty picker would still be a lie.
    services().diagnostics.report('warn', 'Anthropic returned no usable models for this API key');
    return {
      models: planner.models(),
      fallbackReason: 'Anthropic returned no usable models for this key',
    };
  } catch (error) {
    services().diagnostics.report('error', 'Could not fetch the model list from Anthropic', error);
    return { models: planner.models(), fallbackReason: failureReason(error) };
  }
}
