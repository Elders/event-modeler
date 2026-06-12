// The mini color dots used by pattern-stamp rows.

import type { BlockType } from '../blocks';

export type DotKind = BlockType | 'sketch' | 'gear';

export function Dot({ kind }: { kind: DotKind }) {
  if (kind === 'gear') {
    return (
      <span className="dot dot-gear" aria-hidden="true">
        ⚙
      </span>
    );
  }
  if (kind === 'sketch') return <span className="dot dot-sketch" />;
  return <span className={`dot bg-${kind}`} />;
}
