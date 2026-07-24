// Factory for the Figma-backed DesignSource. The panel's composition root calls
// this and adds the result to the Services bundle; swapping in a different design
// tool is a matter of providing another DesignSource here. Only the panel page
// wires it — the headless board script has no use for it, so it stays free of
// this adapter and its code.

import type { DesignSource } from '../../ports/designSource';
import { FigmaDesignSource } from './source';

export function createFigmaDesignSource(): DesignSource {
  return new FigmaDesignSource();
}
