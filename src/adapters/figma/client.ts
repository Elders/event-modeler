// Transport for the Figma REST API: the two GETs the import needs, and nothing
// about their shape (that's extract.ts). Both calls run directly from the
// browser with the user's own token — the CORS preflight for the X-Figma-Token
// header is allowed, so no proxy is needed (a proxy base can still be supplied
// for a future host; see DesignSourceSettings.proxyUrl).
//
// Propagates, never fabricates: a refusal Figma *answered* (a 4xx) throws a
// plain Error with a user-facing message; a request that never reached Figma (a
// network/CORS reject, a 5xx) throws HostUnavailableError, so a caller can tell
// "the file isn't there" from "Figma is down". An abort is the user's Stop and
// is rethrown as-is, never dressed up as a host failure.

import { HostUnavailableError } from '../../ports/errors';
import { describeFigmaStatus, rateLimitMessage } from './errors';

export const FIGMA_API_BASE = 'https://api.figma.com';

async function figmaGet(
  base: string,
  path: string,
  token: string,
  what: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { headers: { 'X-Figma-Token': token }, signal });
  } catch (error) {
    if (signal?.aborted) throw error; // the user's Stop, not a host failure
    throw new HostUnavailableError('Could not reach Figma.', error);
  }
  if (!response.ok) {
    // A 429 carries a Retry-After (exposed cross-origin), so name the wait.
    if (response.status === 429) {
      throw new Error(rateLimitMessage(response.headers.get('Retry-After')));
    }
    const message = describeFigmaStatus(response.status, response.statusText);
    // A 5xx means Figma didn't really answer — treat it as unreachable so a
    // caller that continues past a refusal still stops here.
    if (response.status >= 500) throw new HostUnavailableError(message, response.status);
    throw new Error(message);
  }
  // Read the body as text and parse it ourselves. `response.json()` on an empty
  // body throws a bare "Unexpected end of JSON input" naming neither the request
  // nor the cause; an empty 2xx is an anomaly worth reporting plainly — most
  // often an ad blocker / privacy extension / VPN intercepting api.figma.com and
  // handing back a blank 200 (the same class of interference DECISIONS.md notes
  // for eventhub), or a corporate proxy doing the same.
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new HostUnavailableError(`Figma's ${what} response could not be read.`, error);
  }
  if (!body.trim()) {
    throw new Error(
      `Figma returned an empty response for the ${what} request (HTTP ${response.status}). ` +
        'An ad blocker, privacy extension, or VPN may be intercepting api.figma.com — ' +
        'try disabling it, or an incognito window.',
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`Figma returned a response that wasn't valid JSON for the ${what} request.`);
  }
}

// The full file document — every page's tree, walked for the screen frames,
// their labels, and the prototype flow. One call: Figma's file-content limit is
// a request count, so a single read beats splitting it.
export function fetchFigmaFile(
  base: string,
  fileKey: string,
  token: string,
  signal?: AbortSignal,
): Promise<unknown> {
  return figmaGet(base, `/v1/files/${encodeURIComponent(fileKey)}`, token, 'file', signal);
}

export function fetchFigmaImages(
  base: string,
  fileKey: string,
  nodeIds: string[],
  token: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const params = new URLSearchParams({ ids: nodeIds.join(','), format: 'png', scale: '2' });
  return figmaGet(base, `/v1/images/${encodeURIComponent(fileKey)}?${params}`, token, 'image render', signal);
}
