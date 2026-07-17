// The CreditMeter port: how much of the host's API budget this app has spent.
//
// A gauge, never a control. The host's own refusal — the 429 — remains the only
// thing that throttles anything (see adapters/miro/rateLimit), so a wrong figure
// here stays harmless. That is deliberate rather than unambitious: the meter
// cannot see calls this app didn't make, so standing the tool down on a number
// that might be too high would be an outage with no symptom to diagnose it by.
//
// The host decides how to count and how to share the figure between pages; the
// weights are the canvas adapter's business, so what arrives here is already a
// plain credit cost.

import type { CreditUsage } from '../domain/credits';

// What the host said when it actually refused, which is the one measured fact in
// this whole feature. Everything else is derived from calls we counted ourselves.
export interface CreditExhaustion {
  window: 'minute' | 'hour';
  atMs: number;
  untilMs: number;
}

export interface CreditMeter {
  // Records credits this page just spent. Never throws and never returns a
  // promise: it is called from inside the rate limiter on every single SDK call,
  // and must not change that call's timing or mask its failure.
  charge(cost: number): void;

  // Records that the host itself refused. Kept apart from `charge` precisely
  // because it is not an estimate — the UI leans on that distinction.
  markExhausted(exhaustion: CreditExhaustion): void;

  // This app's estimated spend against both budgets, across every page.
  //
  // Computed on demand, and deliberately not paired with a subscribe(): the
  // figure changes as much from time passing — charges ageing out of the window
  // — as from spend, and no subscription can announce the clock. Anything
  // showing a live figure has to tick anyway, so a tick that reads this is the
  // whole mechanism rather than half of two.
  usage(): CreditUsage;

  // The live refusal, or null once its cooldown has lapsed.
  exhaustion(): CreditExhaustion | null;
}
