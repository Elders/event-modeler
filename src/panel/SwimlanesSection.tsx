// Board setup: insert the three-lane swimlane guides.

import { insertSwimlanes } from '../features/swimlanes';
import type { Guard } from './useBusyGuard';

export function SwimlanesSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  return (
    <section className="section">
      <button
        className="button button-secondary button-small w-full"
        type="button"
        disabled={busy}
        onClick={guard(() => insertSwimlanes())}
      >
        Insert swimlanes
      </button>
      <p className="footnote centered">Screens · Commands &amp; read models · Events</p>
    </section>
  );
}
