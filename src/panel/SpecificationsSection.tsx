// Specification tools: add a Given/When/Then spec (attached to the selected
// slice, or standalone).

import { addSpecification } from '../features/specs/create';
import type { Guard } from './useBusyGuard';

export function SpecificationsSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  return (
    <section className="section">
      <h2 className="section-title">Specifications</h2>
      <p className="section-sub">Given · When · Then scenarios</p>
      <button
        className="button button-secondary button-small w-full"
        type="button"
        disabled={busy}
        onClick={guard(() => addSpecification())}
      >
        Add specification
      </button>
      <p className="footnote">
        Select a slice first to attach the spec beneath it; otherwise it is standalone. Use the
        red Error sticky for a failing Then.
      </p>
      <p className="footnote">
        Each section has a + button on the board: click it, then select items on the model —
        linked copies land in that section and follow edits to the original. Resize a spec and
        its copies re-grid to the new width automatically.
      </p>
    </section>
  );
}
