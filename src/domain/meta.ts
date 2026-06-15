// Element metadata: the type tags the tool attaches to the elements it
// creates so it can recognize them later (the model stays machine-readable,
// and on-canvas buttons are identified by their tag on selection).
//
// Pure domain: an adapter decides *how* to persist this with an element; the
// shape of the tag is defined here.

import type { BlockType } from './vocabulary';
import type { SpecZoneId } from './spec';

export type ElementMeta =
  // A modeled block (sticky card, automation, screen).
  | { type: BlockType }
  // The on-canvas "+" button that arms a specification zone for copying.
  | { type: 'spec-add'; zone: SpecZoneId; spec: string }
  // The on-canvas "+" button affixed to a slice that adds a spec beneath it.
  | { type: 'slice-add-spec'; slice: string };
