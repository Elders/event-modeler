// The Claude implementation of the Planner port. It asks Claude for a
// structured event model (JSON Schema constrained), then hands the raw object
// to the domain's `normalizePlan` for validation. The API key and model come
// from browser-local settings, and every call runs directly from the browser
// (the user's own key), so the SDK needs `dangerouslyAllowBrowser`.

import Anthropic from '@anthropic-ai/sdk';
import { normalizePlan, type ModelPlan } from '../../domain/plan';
import type { Planner, PlannerModel, PlannerSettings } from '../../ports/planner';
import { describeError } from './errors';
import { fetchModelCatalog, type ModelCatalog } from './modelList';
import { PLANNER_MODELS, supportsAdaptiveThinking } from './models';
import { PLAN_SCHEMA, SYSTEM_PROMPT } from './prompt';
import { readSettings, writeSettings } from './settings';

export class AnthropicPlanner implements Planner {
  // The live model list, cached for the page's lifetime so tab switches don't
  // refetch. `inFlight` also deduplicates concurrent calls (StrictMode mounts
  // effects twice); a failed attempt un-caches itself so the next call
  // retries, and a changed key starts a fresh fetch.
  private catalog: ModelCatalog | null = null;
  private inFlight: Promise<ModelCatalog> | null = null;
  private catalogKey = '';

  models(): PlannerModel[] {
    return PLANNER_MODELS;
  }

  defaultPreamble(): string {
    return SYSTEM_PROMPT;
  }

  async fetchModels(): Promise<PlannerModel[]> {
    const apiKey = readSettings().apiKey.trim();
    if (!apiKey) {
      throw new Error('Add your Anthropic API key in the panel settings first.');
    }
    if (!this.inFlight || this.catalogKey !== apiKey) {
      this.catalogKey = apiKey;
      const attempt: Promise<ModelCatalog> = fetchModelCatalog(apiKey).then(
        (catalog) => {
          if (this.inFlight === attempt) this.catalog = catalog;
          return catalog;
        },
        (error) => {
          if (this.inFlight === attempt) this.inFlight = null;
          throw error;
        },
      );
      this.inFlight = attempt;
    }
    return (await this.inFlight).models;
  }

  getSettings(): PlannerSettings {
    return readSettings();
  }

  setSettings(settings: PlannerSettings): void {
    writeSettings(settings);
  }

  async plan(text: string, signal?: AbortSignal, systemSuffix?: string): Promise<ModelPlan> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Paste some text to model first.');
    return this.complete(trimmed, systemSuffix, signal);
  }

  async planFromImages(
    images: string[],
    text: string,
    signal?: AbortSignal,
    systemSuffix?: string,
  ): Promise<ModelPlan> {
    if (images.length === 0) throw new Error('No pages to model.');
    // Images first (in order), then a text block with the accompanying notes.
    const content: Anthropic.ContentBlockParam[] = images.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data },
    }));
    if (text.trim()) content.push({ type: 'text', text: text.trim() });
    return this.complete(content, systemSuffix, signal);
  }

  // The shared request: build the system prompt (preamble + any per-call suffix),
  // send the content (a string for text, blocks for vision) under the plan schema,
  // and coerce the response through the domain's normalizePlan trust boundary.
  private async complete(
    content: string | Anthropic.ContentBlockParam[],
    systemSuffix: string | undefined,
    signal?: AbortSignal,
  ): Promise<ModelPlan> {
    const { apiKey, model, preamble } = readSettings();
    if (!apiKey.trim()) {
      throw new Error('Add your Anthropic API key in the panel settings first.');
    }

    const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });

    // `readSettings` guarantees the preamble is non-empty (a blank one falls back
    // to SYSTEM_PROMPT). The suffix is the per-source guidance (Figma / PDF).
    const system = systemSuffix ? `${preamble}\n\n${systemSuffix}` : preamble;

    let message: Anthropic.Message;
    try {
      // Stream rather than a single call: at a 32k-token budget the SDK refuses a
      // non-streaming request up front (it may exceed its 10-minute ceiling).
      // finalMessage() accumulates the stream back into the same Message shape,
      // so the rest of this method is unchanged.
      const stream = client.messages.stream(
        {
          model,
          // Headroom so a multi-screen vision plan (plus adaptive thinking, which
          // shares this budget) finishes rather than truncating mid-JSON. A
          // ceiling, not a target — unused tokens aren't charged.
          max_tokens: 32000,
          system,
          messages: [{ role: 'user', content }],
          output_config: { format: { type: 'json_schema', schema: PLAN_SCHEMA } },
          ...(this.supportsAdaptive(model) ? { thinking: { type: 'adaptive' as const } } : {}),
        },
        { signal },
      );
      message = await stream.finalMessage();
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
      // With a JSON schema constraining the output, a parse failure means the
      // response was cut off — say so, and how to fix it, instead of "not valid
      // JSON" (which reads as a fluke to "try again").
      if (message.stop_reason === 'max_tokens') {
        throw new Error(
          'Claude ran out of output space before finishing the model — try fewer pages or screens per import.',
        );
      }
      throw new Error('Claude returned a response that was not valid JSON — try again.');
    }

    const plan = normalizePlan(parsed);
    if (plan.slices.length === 0) {
      throw new Error('Claude did not produce any model blocks — try a more detailed description.');
    }
    return plan;
  }

  // Whether to request adaptive thinking: the provider's capability answer
  // when a live fetch has recorded one, the id heuristic otherwise. The live
  // list can offer models the heuristic was never written for, so a fetched
  // answer must win over the guess.
  private supportsAdaptive(model: string): boolean {
    return this.catalog?.adaptive.get(model) ?? supportsAdaptiveThinking(model);
  }
}
