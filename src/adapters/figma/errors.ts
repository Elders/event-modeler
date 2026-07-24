// Turn a Figma REST failure into a message worth showing to the user. The
// adapter still propagates — this only rewrites the wording before it throws.
// The client decides HostUnavailableError vs a plain Error (see client.ts); this
// just supplies the words for the answered-but-refused cases.

export function describeFigmaStatus(status: number, statusText: string): string {
  if (status === 401 || status === 403) {
    return 'Figma rejected the token — check it in the panel settings and that it has the file_content:read scope.';
  }
  if (status === 404) {
    return "Figma couldn't find that file — check the URL, and that the file is shared with the token's account.";
  }
  return `Figma request failed (${status} ${statusText}).`;
}

// A 429 carries a Retry-After (seconds), which Figma exposes cross-origin
// (access-control-expose-headers: Retry-After), so we can tell the user how long
// to wait instead of a vague "a moment". Figma's file endpoint is cost-weighted,
// so a burst of imports can trip this; it clears on its own.
export function rateLimitMessage(retryAfter: string | null): string {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) {
    const minutes = Math.ceil(seconds / 60);
    const wait =
      seconds >= 90
        ? `${minutes} minute${minutes === 1 ? '' : 's'}`
        : `${Math.ceil(seconds)} second${Math.ceil(seconds) === 1 ? '' : 's'}`;
    return `Figma rate limit hit — wait ${wait} and try again.`;
  }
  return 'Figma rate limit hit — wait a moment and try again.';
}
