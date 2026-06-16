// One-click stamps for the event-modeling patterns.

import './PatternsSection.css';
import { stampPattern, type PatternId } from '../features/patterns';
import { Dot, type DotKind } from './Dot';
import type { Guard } from './useBusyGuard';

const PATTERN_ROWS: { id: PatternId; name: string; info: string; dots: DotKind[] }[] = [
  {
    id: 'command',
    name: 'State change',
    info: 'A user acts on a screen, issuing a command that produces an event — the basic write path.',
    dots: ['sketch', 'command', 'event'],
  },
  {
    id: 'view',
    name: 'State view',
    info: 'An event feeds a read model that a screen displays — the basic read path.',
    dots: ['event', 'readModel', 'sketch'],
  },
  {
    id: 'automation',
    name: 'Automation',
    info: 'A read model triggers an automation that issues a command, producing an event — no user involved.',
    dots: ['readModel', 'gear', 'command', 'event'],
  },
  {
    id: 'translation',
    name: 'Translation',
    info: 'An external event drives an automation that issues a command, producing an internal event.',
    dots: ['externalEvent', 'gear', 'command', 'event'],
  },
  {
    id: 'processor',
    name: 'Processor todo-list',
    info: "A command's event adds work to a read model used as a todo list; an automation works items off it and the resulting event marks them done.",
    dots: ['command', 'event', 'readModel', 'gear', 'command', 'event'],
  },
  {
    id: 'reservation',
    name: 'Reservation',
    info: 'A command tentatively reserves a limited resource; an automation reads availability and issues a command to confirm.',
    dots: ['command', 'event', 'readModel', 'gear', 'command', 'event'],
  },
  {
    id: 'lookup',
    name: 'Lookup table',
    info: 'A screen backed by one or more read models, each hydrated by its own event.',
    dots: ['sketch', 'readModel', 'event', 'readModel', 'event'],
  },
  {
    id: 'projection',
    name: 'Projected read model',
    info: 'A command produces an event that is projected into a read model.',
    dots: ['command', 'event', 'readModel'],
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
          title={row.info}
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
