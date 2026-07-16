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
