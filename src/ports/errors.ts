// The one distinction every port contract needs: could the host not be reached,
// or did it answer?
//
// Without it, callers cannot tell "the board says this element has no fields"
// from "the board did not answer". Everything used to catch both and return the
// first — which is how an hour of rate limiting looked exactly like an empty
// board (see DECISIONS.md). A caller that legitimately carries on past a failure
// must first check that the failure was not this one: a host that isn't
// answering will not answer the next call either, and continuing just spreads
// the damage.

export class HostUnavailableError extends Error {
  // The underlying failure, kept for the log.
  readonly reason: unknown;

  constructor(message: string, reason: unknown) {
    super(message);
    this.name = 'HostUnavailableError';
    this.reason = reason;
  }
}

export function isHostUnavailable(error: unknown): boolean {
  return error instanceof HostUnavailableError;
}

// The board's app-data budget is a hard total cap (~31 KB across all keys, see
// DECISIONS.md), and a write that goes over it fails distinctly. This is the one
// write failure a caller may legitimately carry on past: the generation build
// drops its (optional) resume checkpoint rather than failing the whole build —
// but only for THIS condition, never a genuine write failure. Same shape and
// same purpose as HostUnavailableError: a named condition to branch on.
export class StorageFullError extends Error {
  readonly reason: unknown;

  constructor(message: string, reason: unknown) {
    super(message);
    this.name = 'StorageFullError';
    this.reason = reason;
  }
}

export function isStorageFull(error: unknown): boolean {
  return error instanceof StorageFullError;
}
