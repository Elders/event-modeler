// The color/glyph swatch shown on a building-block tile. Most tiles are typed
// blocks (a colored swatch); a few are tool tiles (specification, swimlanes)
// whose glyph hints at the structure they place.

import './Swatch.css';
import type { PaletteKind } from '../domain/vocabulary';

export function Swatch({ kind }: { kind: PaletteKind }) {
  if (kind === 'automation') {
    return (
      <span className="swatch glyph glyph-automation" aria-hidden="true">
        ⚙
      </span>
    );
  }
  if (kind === 'screen') {
    return (
      <span className="swatch glyph glyph-screen" aria-hidden="true">
        ✎
      </span>
    );
  }
  if (kind === 'slice') {
    return (
      <span className="swatch glyph glyph-slice" aria-hidden="true">
        <span className="slice-tab" />
      </span>
    );
  }
  if (kind === 'specification') {
    return (
      <span className="swatch glyph glyph-spec" aria-hidden="true">
        ▤
      </span>
    );
  }
  if (kind === 'swimlanes') {
    return (
      <span className="swatch glyph glyph-lanes" aria-hidden="true">
        ≡
      </span>
    );
  }
  return <span className={`swatch bg-${kind}`} />;
}
