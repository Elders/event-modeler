// The Fields editor: reacts to the board selection and lets the user define
// fields on the selected block. Resolves the first fieldable element in the
// selection (a screen's box/title share the group, so we scan past them via
// each item's meta), shows a grip + name input + type picker + optional
// toggle per field — rows reorder by dragging the grip (or arrow keys on
// it) — and persists every change through the fields use-case. Persistence is serialized in
// features/fields/edit, so we save optimistically without a busy lock.
//
// Reading the board can fail, and this must never render a failure as an answer.
// A rate-limited board used to reach here as `null` from every read, which the
// editor showed as "nothing selected" — indistinguishable from an empty board,
// for the hour the credit budget took to refill (see DECISIONS.md). So: a
// failure is its own state, it says so on screen, and it retries.

import './FieldsSection.css';
import { useEffect, useRef, useState } from 'react';
import { BLOCKS, type BlockType } from '../domain/vocabulary';
import { completenessHousekeeping } from '../features/completeness';
import { failureReason, reportToLog } from '../features/diagnostics';
import { reportError } from '../features/helpers';
import { findFieldsBox } from '../features/fields/board';
import { setFields as saveFields } from '../features/fields/edit';
import { resolveFieldTargets, type FieldTarget } from '../features/fields/recognize';
import { syncFieldsFromBoard } from '../features/fields/sync';
import {
  FIELD_TYPES,
  displayMode,
  newField,
  type Field,
  type FieldType,
} from '../features/fields/model';
import { services } from '../services';
import { useDragReorder } from './useDragReorder';
import { useSelection } from './useSelection';

// How often a failed read tries again on its own. Deliberately slow: the failure
// this exists for is an exhausted hourly credit budget, and a tight retry loop
// would be spending the very thing that ran out. The Retry button is there for
// anyone who doesn't want to wait.
const RETRY_MS = 15_000;

function blockLabel(type: BlockType): string {
  return BLOCKS.find((block) => block.type === type)?.label ?? type;
}

// True only when the user is actually typing in one of our inputs. The
// document.activeElement half is not enough on its own: this panel is an iframe,
// and a blurred document keeps reporting its last focused element forever — so
// clicking from a field input onto the board used to leave this permanently
// true, silently killing the poll below. hasFocus() is what distinguishes them.
function editingInPanel(): boolean {
  if (!document.hasFocus()) return false;
  const active = document.activeElement;
  return active instanceof HTMLElement && active.classList.contains('field-input');
}

export function FieldsSection() {
  // A selection we couldn't read is a failure too — and it has to win over the
  // "nothing selected" placeholder for exactly the same reason as our own reads.
  const { items: selection, failure: selectionFailure } = useSelection();
  const selectionKey = selection.map((item) => item.id).join(',');
  // Every field-bearing block in the selection, not just one of them. The editor
  // acts only when there is exactly one: Miro reports a selection in its own
  // order, so picking "the first" picked an arbitrary block and then edited it
  // without saying which.
  const [targets, setTargets] = useState<FieldTarget[]>([]);
  const target = targets.length === 1 ? targets[0] : null;
  const [fields, setFields] = useState<Field[]>([]);
  // Why the editor has nothing to show, when it has nothing to show. null means
  // the board answered; a string means it didn't, and the editor says so instead
  // of pretending the selection isn't fieldable.
  const [failure, setFailure] = useState<string | null>(null);
  // Bumped to force a re-read of the same selection (the Retry button, and the
  // timer below).
  const [attempt, setAttempt] = useState(0);
  // The element whose fields are currently loaded into the editor. Reloading is
  // gated on this so a spurious selection re-fire (or a slow registry read
  // landing after an edit) can't clobber what the user is actively editing.
  const loadedId = useRef<string | null>(null);

  // Re-resolve the targets whenever the selected ids change; reload the fields
  // only when the single resolved target is a *different* element.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await resolveFieldTargets(selection);
        if (cancelled) return;
        setTargets(found);
        setFailure(null);
        // Only ever load for exactly one. Several selected blocks is a question
        // for the user, not a block for us to pick.
        const single = found.length === 1 ? found[0] : null;
        const foundId = single?.id ?? null;
        if (foundId === loadedId.current) return;
        // Reconcile the on-board display back into the registry: parse fields the
        // user typed on a sticky (text mode), or recover a box-mode block's fields
        // from its attached box when its registry record was lost.
        const loaded = single ? await syncFieldsFromBoard(single.id, single.type) : [];
        if (cancelled) return;
        setFields(loaded);
        // Marked loaded only now. Setting it before the await meant a cancelled
        // or failed load still claimed the element was loaded, and the early
        // return above then refused to ever read it again.
        loadedId.current = foundId;
      } catch (error) {
        if (cancelled) return;
        reportToLog("Could not read the selected element's fields", error);
        loadedId.current = null; // nothing was loaded — let a retry re-read it
        setFields([]); // don't leave another element's fields on screen
        // Drop the targets as well. They would otherwise keep their stale value
        // (the throw happened before setTargets), leaving the poll below running
        // against the old element every 2.5s while this failure is on screen —
        // spending API credits on the board that just told us it has none.
        setTargets([]);
        setFailure(failureReason(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectionKey, attempt]);

  // Retry a failed read on its own, so a board that comes back (credits refill,
  // network returns) heals the tab without the user having to re-click anything.
  // Only while failed — there is nothing to retry otherwise.
  useEffect(() => {
    if (!failure) return;
    const timer = window.setInterval(() => setAttempt((n) => n + 1), RETRY_MS);
    return () => clearInterval(timer);
  }, [failure]);

  // While the target stays selected, reflect edits made directly on the board:
  // Miro fires no item-update event, so poll the text that displays the fields —
  // the sticky's own (text mode) or the attached box's (box mode) — and
  // reconcile when it changes. Skipped while a panel input is focused, so a
  // canvas poll can never clobber what the user is typing here.
  useEffect(() => {
    if (!target) return;
    const { id, type } = target;
    let stopped = false;
    let lastContent: string | null = null;
    let boxId: string | null = null; // resolved lazily, then cached across ticks
    const watched = async (): Promise<string | null> => {
      if (displayMode(type) === 'text') {
        const [element] = await services().canvas.get([id]);
        return element?.content ?? null;
      }
      const box = await findFieldsBox(id, boxId);
      boxId = box?.id ?? null;
      return box?.content ?? null;
    };
    const tick = async () => {
      if (editingInPanel()) return;
      const content = await watched();
      if (stopped || content === null || content === lastContent) return;
      const reconciled = await syncFieldsFromBoard(id, type);
      if (stopped) return;
      setFields(reconciled);
      // Recorded only after the reconcile lands. Setting it first meant a failed
      // reconcile still marked the content as seen, and every later tick then
      // skipped it as unchanged — the poll stayed alive but did nothing.
      lastContent = content;
    };
    // Poll slowly: this only catches fields typed directly on the board (the
    // panel inputs update immediately on their own), so a relaxed cadence keeps
    // it from being a constant drain on the shared API budget while selected.
    //
    // Supervisor: a failed tick must not become an unhandled rejection or stop
    // the timer. It reports and the next tick tries the same content again.
    const timer = window.setInterval(
      () =>
        void tick().catch((error) =>
          reportToLog('Could not re-read the selected element from the board', error),
        ),
      2500,
    );
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [target?.id, target?.type]);

  // After a field edit, run a completeness pass so connectors recolor right away
  // for the editing user instead of waiting for the headless poll. Debounced so a
  // burst of edits triggers one pass, and chained after the write so it reads the
  // note's updated text. The headless poll remains the fallback for everyone else.
  const nudgeTimer = useRef<number | null>(null);
  const nudgeCompleteness = () => {
    if (nudgeTimer.current !== null) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => void completenessHousekeeping(), 300);
  };
  useEffect(
    () => () => {
      if (nudgeTimer.current !== null) clearTimeout(nudgeTimer.current);
    },
    [],
  );

  // Immediate persist (add / remove / type change). The list is the source of
  // truth while editing, so update locally first and write through.
  const save = (next: Field[]) => {
    setFields(next);
    if (target) void saveFields(target.id, target.type, next).then(nudgeCompleteness).catch(reportError);
  };

  // Local-only update while typing a text input; committed on blur.
  const edit = (id: string, patch: Partial<Field>) =>
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  // Enter in a name input inserts a fresh field right below that row and moves
  // focus into it. The name inputs register themselves by field id so the
  // post-render effect can find the freshly mounted row's input to focus.
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const input = nameInputs.current.get(pendingFocus.current);
    if (!input) return;
    pendingFocus.current = null;
    input.focus();
  });

  const insertBelow = (id: string) => {
    const index = fields.findIndex((field) => field.id === id);
    if (index < 0) return;
    const added = newField();
    const next = [...fields];
    next.splice(index + 1, 0, added);
    pendingFocus.current = added.id;
    save(next);
  };

  const persist = () => {
    if (target) void saveFields(target.id, target.type, fields).then(nudgeCompleteness).catch(reportError);
  };

  // Reorder: move one field to a new position and write through like any edit.
  const reorder = useDragReorder(fields.length, (from, to) => {
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    save(next);
  });

  // Row classes for the drag visuals: dim the dragged row, and mark the row
  // whose edge shows the insertion line — suppressed when the drop slot would
  // put the row right back where it is.
  const rowClass = (index: number, count: number) => {
    const { dragIndex, dropIndex } = reorder;
    let cls = 'field-row';
    if (dragIndex === index) cls += ' dragging';
    if (dragIndex === null || dropIndex === null) return cls;
    if (dropIndex === dragIndex || dropIndex === dragIndex + 1) return cls;
    if (dropIndex === index) cls += ' drop-before';
    else if (dropIndex === count && index === count - 1) cls += ' drop-after';
    return cls;
  };

  // The board didn't answer — about the selection, or about the element in it.
  // Saying so is the entire point: this is the state that used to render as the
  // placeholder below, which reads as "your selection has no fields" — a claim
  // we cannot make when we couldn't read it.
  const unreadable = selectionFailure ?? failure;
  if (unreadable) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="fields-failure">Couldn't read the board, so the fields aren't shown.</p>
        <p className="fields-failure-reason">{unreadable}</p>
        <button
          className="button button-small w-full"
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </button>
        <p className="footnote">Retrying on its own every 15 seconds. See the Console tab.</p>
      </section>
    );
  }

  // Several blocks selected. The editor could show one of them — it used to —
  // but the one it showed was Miro's pick, and editing it changed a block the
  // user never chose. Asking is the only honest option until editing several at
  // once is a thing this can actually do.
  if (targets.length > 1) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="section-sub">
          {targets.length} blocks selected — select a single one to edit its fields.
        </p>
      </section>
    );
  }

  if (!target) {
    return (
      <section className="section">
        <h2 className="section-title">Fields</h2>
        <p className="section-sub">
          Select a command, event, read model, external event, screen, or automation to define
          its fields.
        </p>
      </section>
    );
  }

  return (
    <section className="section">
      <h2 className="section-title">Fields</h2>
      <p className="section-sub">{blockLabel(target.type)}</p>

      <div className="fields-list" {...reorder.listProps}>
        {fields.map((field, index) => (
          <div className={rowClass(index, fields.length)} key={field.id} {...reorder.rowProps(index)}>
            <button
              className="field-grip"
              type="button"
              aria-label="Move field (drag, or arrow keys)"
              title="Drag to reorder"
              {...reorder.handleProps(index)}
            >
              ⠿
            </button>
            <input
              className="field-input field-name"
              placeholder="name"
              value={field.name}
              ref={(el) => {
                if (el) nameInputs.current.set(field.id, el);
                else nameInputs.current.delete(field.id);
              }}
              onChange={(e) => edit(field.id, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                insertBelow(field.id);
              }}
              onBlur={persist}
            />
            <select
              className="field-input field-type"
              value={field.type}
              onChange={(e) =>
                save(
                  fields.map((f) =>
                    f.id === field.id
                      ? {
                          ...f,
                          type: e.target.value as FieldType,
                          customType: e.target.value === 'custom' ? f.customType : undefined,
                        }
                      : f,
                  ),
                )
              }
            >
              {FIELD_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className={field.optional ? 'field-optional on' : 'field-optional'}
              type="button"
              aria-pressed={!!field.optional}
              aria-label="Optional field"
              title="Optional — shown as a ? after the type"
              onClick={() =>
                save(
                  fields.map((f) => (f.id === field.id ? { ...f, optional: !f.optional } : f)),
                )
              }
            >
              ?
            </button>
            {field.type === 'custom' && (
              <input
                className="field-input field-custom"
                placeholder="type name"
                value={field.customType ?? ''}
                onChange={(e) => edit(field.id, { customType: e.target.value })}
                onBlur={persist}
              />
            )}
            <button
              className="field-remove"
              type="button"
              aria-label="Remove field"
              onClick={() => save(fields.filter((f) => f.id !== field.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        className="button button-small w-full"
        type="button"
        onClick={() => save([...fields, newField()])}
      >
        + Add field
      </button>
    </section>
  );
}
