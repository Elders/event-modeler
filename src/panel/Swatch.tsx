// The color/glyph swatch shown on a building-block tile.

import type { BlockType } from '../blocks';

export function Swatch({ type }: { type: BlockType }) {
  if (type === 'automation') {
    return (
      <span className="swatch glyph glyph-automation" aria-hidden="true">
        ⚙
      </span>
    );
  }
  if (type === 'screen') {
    return (
      <span className="swatch glyph glyph-screen" aria-hidden="true">
        ✎
      </span>
    );
  }
  if (type === 'slice') {
    return (
      <span className="swatch glyph glyph-slice" aria-hidden="true">
        <span className="slice-tab" />
      </span>
    );
  }
  return <span className={`swatch bg-${type}`} />;
}
