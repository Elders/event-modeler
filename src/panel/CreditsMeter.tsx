// The credit meter above the Console log: how much of Miro's API budget this
// app's own calls have spent, against each of the two budgets.
//
// Every word of the labelling is load-bearing. Miro reports nothing back — no
// rate-limit headers, no usage query — so this is counted from calls we made
// ourselves, and it cannot see a REST bot, another app, or another board tab
// spending the same budget. A bar reading "credits remaining" would be exactly
// the confident-looking, unmeasured number this codebase refuses to produce, and
// it would be wrong in precisely the situation it exists for.
//
// So it says "spent by this app", and the payload is the comparison. When Miro
// really refuses, the band under the bars carries that refusal — the one
// measured fact on this panel — and a bar reading 8% beside it says the budget
// is going somewhere this app cannot see. That is the question worth answering
// when the board stops responding, and it is what earns an estimate its place.

import './CreditsMeter.css';
import { useEffect, useState } from 'react';
import {
  creditExhaustion,
  creditUsage,
  type CreditExhaustion,
  type CreditUsage,
  type CreditWindow,
} from '../features/credits';

// The figure moves with the clock as much as with spend — charges age out of the
// window whether or not anything is called — so it is read on a timer rather
// than subscribed to. A local timer costs no API credits, which is what lets a
// panel watch a budget without spending it.
const TICK_MS = 1_000;

// Where a bar goes red. Deliberately short of the budget rather than at it: by
// the time a bar is full Miro is already refusing calls, so a warning that waits
// for 100% arrives after the thing it warns about. At 90% there is still a
// window to stop whatever is spending.
const WARN_AT = 0.9;

interface Reading {
  usage: CreditUsage;
  exhaustion: CreditExhaustion | null;
}

function read(): Reading {
  return { usage: creditUsage(), exhaustion: creditExhaustion() };
}

function useCreditsTick(): Reading {
  const [reading, setReading] = useState<Reading>(read);
  useEffect(() => {
    const timer = window.setInterval(() => setReading(read()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return reading;
}

// Credits come in thousands; the exact digit is never the point. Millions get
// their own unit rather than riding up into four-digit thousands — the hourly
// budget is 1M, and "1000k" reads as a typo.
function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(credits >= 10_000_000 ? 0 : 1)}M`;
  }
  if (credits >= 1000) return `${(credits / 1000).toFixed(credits >= 10_000 ? 0 : 1)}k`;
  return String(credits);
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour12: false });
}

function Bar({ label, window: budgetWindow, now }: { label: string; window: CreditWindow; now: number }) {
  const ratio = budgetWindow.spent / budgetWindow.budget;
  const high = ratio >= WARN_AT;
  const over = budgetWindow.spent > budgetWindow.budget;
  const percent = Math.min(100, ratio * 100);
  return (
    <div className="credits-row">
      <div className="credits-head">
        <span className="credits-label">{label}</span>
        <span className="credits-figure">
          {formatCredits(budgetWindow.spent)} / {formatCredits(budgetWindow.budget)}
        </span>
      </div>
      <div
        className="credits-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budgetWindow.budget}
        aria-valuenow={budgetWindow.spent}
        // The figure the bar stands for goes in the name rather than being left
        // to a 5px strip of colour — and so does the fact the colour carries,
        // since "90k of 100k" only reads as *nearly out* if you do the division.
        aria-label={
          `${label}: ${budgetWindow.spent} of ${budgetWindow.budget} credits spent by this app` +
          (over ? ' — over budget' : high ? ' — near the limit' : '')
        }
      >
        <div
          className={`credits-fill${high ? ' credits-fill-high' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {budgetWindow.recoversAt !== null && (
        <p className="credits-recovery">
          Back under budget in {formatDuration(budgetWindow.recoversAt - now)}
        </p>
      )}
    </div>
  );
}

export function CreditsMeter() {
  const { usage, exhaustion } = useCreditsTick();
  const now = Date.now();

  return (
    <div className="credits">
      <p className="credits-title">API credits spent by this app</p>
      <Bar label="Last minute" window={usage.minute} now={now} />
      <Bar label="Last hour" window={usage.hour} now={now} />

      {exhaustion && (
        <p className="credits-refusal">
          Miro refused at {formatClock(exhaustion.atMs)} — the{' '}
          {exhaustion.window === 'hour' ? 'hourly' : 'per-minute'} budget is exhausted. Background
          work is standing down until {formatClock(exhaustion.untilMs)}.
        </p>
      )}

      <p className="credits-note">
        Estimated from this app's own calls — Miro reports no usage back to the Web SDK. The budget
        belongs to your account and this app alone, so other Miro apps never draw on it.
      </p>
      <ul className="credits-scope">
        <li>
          <span className="credits-scope-in">Counted:</span> every board tab you have open in this
          browser.
        </li>
        <li>
          <span className="credits-scope-out">Not counted:</span> this app open on another browser
          or device, and any script calling Miro's REST API with this app's credentials. Both spend
          the same budget without appearing here.
        </li>
      </ul>
    </div>
  );
}
