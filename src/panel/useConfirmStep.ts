// A two-step "arm, then confirm" guard for a destructive button (Replace, Clear
// …). The first click arms a key; a second click on the SAME key within the
// window commits; anything else — arming a different key, an explicit disarm, or
// the window running out — cancels it. The remaining seconds tick down so the
// window is visible on the button rather than a silent deadline.
//
// Keyed rather than boolean so one hook can guard several buttons that are
// mutually exclusive (the arrow toolset's two Replace directions): arming one
// disarms the other for free. A single button just uses one constant key.

import { useEffect, useState } from 'react';

export interface ConfirmStep<K> {
  // Seconds left before the armed key disarms itself, for display. 0 when idle.
  countdown: number;
  // True while this exact key is the armed one.
  isArmed: (key: K) => boolean;
  // A click on `key`: returns true when it COMMITS (the key was already armed),
  // false when it merely armed and is now awaiting a confirming second click.
  request: (key: K) => boolean;
  // Cancel any pending confirmation (an unrelated action ran, the selection
  // moved on, …).
  disarm: () => void;
}

export function useConfirmStep<K>(seconds: number): ConfirmStep<K> {
  const [armed, setArmed] = useState<K | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Count the window down and disarm at zero. Timed off a fixed deadline (not a
  // running sum) so a throttled tab can't drift the window longer than intended.
  useEffect(() => {
    if (armed === null) {
      setCountdown(0);
      return;
    }
    const deadline = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.ceil((deadline - Date.now()) / 1000);
      if (left <= 0) setArmed(null);
      else setCountdown(left);
    };
    tick(); // show the full count on this render, not a second late
    const timer = window.setInterval(tick, 200);
    return () => clearInterval(timer);
  }, [armed, seconds]);

  const request = (key: K): boolean => {
    if (armed !== null && Object.is(armed, key)) {
      setArmed(null);
      return true; // second click on the armed key — commit
    }
    setArmed(key); // first click (or a switch to another key) — arm, await confirm
    return false;
  };

  return {
    countdown,
    isArmed: (key) => armed !== null && Object.is(armed, key),
    request,
    disarm: () => setArmed(null),
  };
}
