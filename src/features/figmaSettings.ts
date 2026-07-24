// Thin panel-facing wrappers over the DesignSource's own configuration, so the
// panel reads and writes the Figma token through a feature rather than reaching
// into the adapter. Mirrors plannerSettings.

import type { DesignSourceSettings } from '../ports/designSource';
import { requireDesignSource } from './helpers';

// Both throw if the settings store can't be reached; the panel is the only
// caller and has somewhere to say so (the same discipline as plannerSettings —
// a swallowed read would claim "no token" when the truth is "couldn't look").
export function getFigmaSettings(): DesignSourceSettings {
  return requireDesignSource().getSettings();
}

export function saveFigmaSettings(settings: DesignSourceSettings): void {
  requireDesignSource().setSettings(settings);
}

// Whether these settings are enough to read a file. Derived, not re-read.
export function isFigmaConfigured(settings: DesignSourceSettings): boolean {
  return settings.token.trim().length > 0;
}
