// The credit meter use-case: what the Console tab reads, expressed against the
// CreditMeter port so the panel never reaches for an adapter.
//
// Thin on purpose. There is no workflow here — only a reading. The arithmetic
// lives in domain/credits, the counting in the adapter behind the port; this is
// just the door between them and the panel, and it exists so the panel doesn't
// have to know which of the two it is talking to.

import type { CreditUsage } from '../domain/credits';
import type { CreditExhaustion } from '../ports/credits';
import { services } from '../services';

export type { CreditUsage, CreditWindow } from '../domain/credits';
export type { CreditExhaustion } from '../ports/credits';

// This app's estimated spend against both budgets, across every page.
//
// Read on a tick rather than subscribed to: the figure moves as charges age out
// of the window, which is the clock and not an event. See ports/credits.
export function creditUsage(): CreditUsage {
  return services().credits.usage();
}

// The host's own last refusal, or null. The one measured fact beside the
// estimate — and the reason the two are shown together.
export function creditExhaustion(): CreditExhaustion | null {
  return services().credits.exhaustion();
}
