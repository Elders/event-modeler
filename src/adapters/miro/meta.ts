// Miro stores per-item app metadata under a single key. Frames are excluded
// (the SDK rejects metadata on frames), which is why slices and specs are
// tracked in the Store registries instead.

export const META_KEY = 'em';
