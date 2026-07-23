// Live model discovery: ask the Anthropic Models API which models this key can
// use, so the Generate picker isn't frozen at whatever was hardcoded when the
// app shipped. The list keeps the API's own order (newest first) and is
// filtered to models that can hold the plan's JSON schema — the planner
// depends on structured outputs. Only an explicit "not supported" excludes:
// a model without capability data is unknown, not unsupported, and an
// over-eager filter would empty the picker.
//
// Alongside the picker list, the fetch records each model's adaptive-thinking
// support, so `plan` can decide from the provider's answer instead of
// guessing from the model id.

import Anthropic from '@anthropic-ai/sdk';
import type { PlannerModel } from '../../ports/planner';
import { describeError } from './errors';

export interface ModelCatalog {
  models: PlannerModel[];
  // model id -> whether `thinking: {type: "adaptive"}` is accepted.
  adaptive: Map<string, boolean>;
}

export async function fetchModelCatalog(apiKey: string): Promise<ModelCatalog> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const models: PlannerModel[] = [];
  const adaptive = new Map<string, boolean>();
  try {
    // Iterating the page auto-fetches follow-up pages; the call is free.
    for await (const m of client.models.list({ limit: 100 })) {
      if (m.capabilities?.structured_outputs.supported === false) continue;
      models.push({ id: m.id, label: m.display_name });
      if (m.capabilities) adaptive.set(m.id, m.capabilities.thinking.types.adaptive.supported);
    }
  } catch (error) {
    throw new Error(describeError(error));
  }
  return { models, adaptive };
}
