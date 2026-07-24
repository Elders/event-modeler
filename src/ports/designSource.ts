// The DesignSource port: turns a design-tool file into a DesignDoc the Planner
// can draft a model from. Figma is the one implementation today; any other
// design tool (or a fixture for tests) could be another. It is the exact sibling
// of the Planner port — a use-case (importFigma) reads a file through it, then
// hands the result to the Planner.
//
// Like the Planner, the port owns its own configuration (the access token),
// because that is the one thing a DesignSource needs and nothing else does. How
// it is stored is an adapter concern; the panel reads and writes it through a
// feature, never touching the adapter.

import type { DesignDoc } from '../domain/designDoc';

export interface DesignSourceSettings {
  // The design tool's access token (a Figma personal access token with the
  // read-only file_content:read scope). Per-user, per-browser — never board app
  // data, exactly like the Planner's API key.
  token: string;
  // Optional base URL to route the REST calls through, reserved for a future
  // host that needs a CORS shim. Unused and empty in the client-side path, where
  // the calls go straight to the provider (browser CORS is allowed there).
  proxyUrl?: string;
}

export interface DesignSource {
  // Read a file into a DesignDoc: the frames, their labels, the flow edges, and
  // each frame's render URL. THROWS with a user-facing message when the provider
  // refuses (bad/blank token, missing scope, unknown file) and throws
  // HostUnavailableError (ports/errors) when the provider can't be reached at
  // all — the caller must be able to tell "the file isn't there" from "the
  // network is down", same distinction every other port draws.
  fetchDesign(fileKey: string, signal?: AbortSignal): Promise<DesignDoc>;

  // Current configuration, and a way to persist a change. Both THROW if the
  // store can't be reached: an empty token means the user hasn't set one, and a
  // silent setSettings means it saved — neither may be said on a guess (the same
  // fabrication the Planner's settings comment warns against).
  getSettings(): DesignSourceSettings;
  setSettings(settings: DesignSourceSettings): void;
}
