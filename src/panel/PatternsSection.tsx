// One-click stamps for the four event-modeling patterns.

import './PatternsSection.css';
import { stampPattern, type PatternId } from '../features/patterns';
import { Dot, type DotKind } from './Dot';
import type { Guard } from './useBusyGuard';

const PATTERN_ROWS: { id: PatternId; name: string; dots: DotKind[] }[] = [
  { id: 'command', name: 'State change', dots: ['sketch', 'command', 'event'] },
  { id: 'view', name: 'State view', dots: ['event', 'readModel', 'sketch'] },
  { id: 'automation', name: 'Automation', dots: ['readModel', 'gear', 'command', 'event'] },
  { id: 'translation', name: 'Translation', dots: ['externalEvent', 'gear', 'command', 'event'] },
  {
    id: 'processor',
    name: 'Processor todo-list',
    dots: ['command', 'event', 'readModel', 'gear', 'command', 'event'],
  },
  {
    id: 'reservation',
    name: 'Reservation',
    dots: ['command', 'event', 'readModel', 'gear', 'command', 'event'],
  },
];

export function PatternsSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  return (
    <section className="section">
      <h2 className="section-title">Pattern stamps</h2>
      <p className="section-sub">Insert a ready-made, pre-linked pattern</p>
      {PATTERN_ROWS.map((row) => (
        <button
          key={row.id}
          type="button"
          className="pattern-row"
          disabled={busy}
          onClick={guard(() => stampPattern(row.id))}
        >
          <span className="dots" aria-hidden="true">
            {row.dots.map((dot, i) => (
              <Dot key={i} kind={dot} />
            ))}
          </span>
          <span className="pattern-name">{row.name}</span>
          <span className="plus" aria-hidden="true">
            +
          </span>
        </button>
      ))}
    </section>
  );
}
