// Turn an Anthropic SDK error into a message worth showing to the user. Shared
// by the plan call and the model-list fetch; the adapter still propagates — it
// only rewrites the wording before throwing.

import Anthropic from '@anthropic-ai/sdk';

export function describeError(error: unknown): string {
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
