// The Claude implementation of the Planner port — the only module that imports
// the Anthropic SDK. It asks Claude for a structured event model (JSON Schema
// constrained), then hands the raw object to the domain's `normalizePlan` for
// validation. The API key and model come from browser-local settings, and the
// call runs directly from the browser (the user's own key), so the SDK needs
// `dangerouslyAllowBrowser`.

import Anthropic from '@anthropic-ai/sdk';
import { normalizePlan, type ModelPlan } from '../../domain/plan';
import type { Planner, PlannerModel, PlannerSettings } from '../../ports/planner';
import { PLANNER_MODELS, supportsAdaptiveThinking } from './models';
import { PLAN_SCHEMA, SYSTEM_PROMPT } from './prompt';
import { readSettings, writeSettings } from './settings';

export class AnthropicPlanner implements Planner {
  models(): PlannerModel[] {
    return PLANNER_MODELS;
  }

  getSettings(): PlannerSettings {
    return readSettings();
  }

  setSettings(settings: PlannerSettings): void {
    writeSettings(settings);
  }

  async plan(text: string, signal?: AbortSignal): Promise<ModelPlan> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Paste some text to model first.');

    const { apiKey, model } = readSettings();
    if (!apiKey.trim()) {
      throw new Error('Add your Anthropic API key in the panel settings first.');
    }

    const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

    let message: Anthropic.Message;
    try {
      message = await client.messages.create(
        {
          model,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: trimmed }],
          output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
          ...(supportsAdaptiveThinking(model) ? { thinking: { type: 'adaptive' as const } } : {}),
        },
        { signal },
      );
    } catch (error) {
      throw new Error(describeError(error));
    }

    const json = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    if (!json.trim()) throw new Error('Claude returned an empty response — try again.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Claude returned a response that was not valid JSON — try again.');
    }

    const plan = normalizePlan(parsed);
    if (plan.slices.length === 0) {
      throw new Error('Claude did not produce any model blocks — try a more detailed description.');
    }
    return plan;
  }
}

// Turn an SDK error into a message worth showing in a toast.
function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Anthropic rejected the API key — check it in the panel settings.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Anthropic rate limit hit — wait a moment and try again.';
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic request failed: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
