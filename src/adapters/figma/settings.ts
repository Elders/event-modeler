// DesignSource configuration storage: the browser's localStorage, scoped to this
// machine. The Figma token is a per-user secret, so it must NOT go into board
// app data (the Store port) — that travels with the document and is shared with
// everyone on the board. localStorage keeps it private to this browser. Same
// reasoning, same shape, and same no-fabrication discipline as the Planner's
// settings (adapters/anthropic/settings.ts).
//
// Neither call catches. "Nothing stored yet" is a real answer and returns an
// empty token; a storage failure or unreadable data is not. Reporting the second
// as the first says "you have no Figma token" when the truth is we couldn't read
// it — the same fabrication that made a rate-limited board look like an empty one
// (see DECISIONS.md).

import type { DesignSourceSettings } from '../../ports/designSource';

const KEY = 'em.figma';

export function readSettings(): DesignSourceSettings {
  const raw = localStorage.getItem(KEY);
  // Never configured. A real answer, not a guess.
  if (!raw) return { token: '' };
  // Unreadable stored data throws rather than resetting to a blank token: the
  // caller can offer to re-enter it, which silently pretending it was never
  // there cannot.
  const parsed = JSON.parse(raw) as Partial<DesignSourceSettings>;
  return {
    token: typeof parsed.token === 'string' ? parsed.token : '',
    // A blank proxy URL means "call the provider directly" — the client-side
    // path. Only a non-empty string is carried.
    ...(typeof parsed.proxyUrl === 'string' && parsed.proxyUrl.trim()
      ? { proxyUrl: parsed.proxyUrl.trim() }
      : {}),
  };
}

export function writeSettings(settings: DesignSourceSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
