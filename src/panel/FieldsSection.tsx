// The Fields editor: reacts to the board selection and lets the user define
// fields on the selected block. Resolves the first fieldable element in the
// selection (a screen's box/title share the group, so we scan past them via
// each item's meta), and shows the fields as an accordion of FieldRows: every
// row is the field's board notation on one line, and the single open row is
// the full editor. Rows reorder by dragging the grip (or arrow keys on it),
// and every change persists through the fields use-case — serialized in
// features/fields/edit, so we save optimistically without a busy lock.
//
// Reading the board can fail, and this must never render a failure as an answer.
// A rate-limited board used to reach here as `null` from every read, which the
// editor showed as "nothing selected" — indistinguishable from an empty board,
// for the hour the credit budget took to refill (see DECISIONS.md). So: a
// failure is its own state, it says so on screen, and it retries.

import './FieldsSection.css';
import { useEffect, useRef, useState } from 'react';
import { FALLBACK_CHECK_MS, SETTLE_MS, fallbackDue } from '../domain/pacing';
import { BLOCKS, type BlockType } from '../domain/vocabulary';
import { completenessHousekeeping } from '../features/completeness';
import { failureReason, reportToLog } from '../features/diagnostics';
import { reportError } from '../features/helpers';
import { isBoardRateLimited } from '../features/hostStatus';
import { findFieldsBox } from '../features/fields/board';
import { setFields as saveFields } from '../features/fields/edit';
import { resolveFieldTargets, type FieldTarget } from '../features/fields/recognize';
import { syncFieldsFromBoard } from '../features/fields/sync';
import { displayMode, newField, type Field } from '../features/fields/model';
import { services } from '../services';
import { ArrowSection } from './ArrowSection';
import { FieldRow } from './FieldRow';
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
  // The accordion: the one field whose editor is open, or null for none. New
  // fields open on creation; a different element's fields load all closed.
  const [openId, setOpenId] = useState<string | null>(null);
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
        setOpenId(null); // a different element's fields start all collapsed
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
        // (the throw happened before setTargets), leaving the watch below running
        // against the old element while this failure is on screen — spending API
        // credits on the board that just told us it has none.
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
  //
  // Stood down while the board is asking to be left alone: the failure this
  // retries is usually an exhausted credit budget, so retrying into it spends
  // more of what already ran out. The timer keeps ticking (it is free) and the
  // first attempt after the cooldown lapses is the probe.
  useEffect(() => {
    if (!failure) return;
    const timer = window.setInterval(() => {
      if (isBoardRateLimited()) return;
      setAttempt((n) => n + 1);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [failure]);

  // While the target stays selected, reflect edits made directly on the board:
  // Miro fires no item-update event, so the text that displays the fields — the
  // sticky's own (text mode) or the attached box's (box mode) — has to be re-read
  // and reconciled when it changes. Skipped while a panel input is focused, so a
  // board read can never clobber what the user is typing here.
  //
  // Activity-driven rather than on a fixed clock, for exactly the reason the
  // board script's passes are (see domain/pacing): the read is a `board.get` at
  // 500 credits, so the fixed 2.5s interval this replaces cost 12,000 credits a
  // minute — 720,000/hour, most of the hourly budget — for one block sitting
  // selected while nobody touched anything.
  //
  // Focus is the free signal. Edits on the board happen while this panel is
  // blurred, and a stale panel only matters once you look back at it — so
  // regaining focus is both the moment something may have changed and the moment
  // it starts mattering. The interval is the same safety net it is on the board,
  // and only that: an edit by a collaborator fires no local event here.
  useEffect(() => {
    if (!target) return;
    const { id, type } = target;
    let stopped = false;
    let lastContent: string | null = null;
    let boxId: string | null = null; // resolved lazily, then cached across reads
    // The effect above just loaded this target's fields, so the safety net isn't
    // due for a full interval yet.
    let lastRead = Date.now();
    let settleTimer: number | null = null;

    const watched = async (): Promise<string | null> => {
      if (displayMode(type) === 'text') {
        const [element] = await services().canvas.get([id]);
        return element?.content ?? null;
      }
      const box = await findFieldsBox(id, boxId);
      boxId = box?.id ?? null;
      return box?.content ?? null;
    };

    const read = async () => {
      // Nothing here is work the user asked for — it is the watch keeping itself
      // fresh — so it stands down rather than spending a budget that's gone.
      if (editingInPanel() || isBoardRateLimited()) return;
      // Stamped even if the read below fails: a board that won't answer
      // shouldn't be asked again on the next check.
      lastRead = Date.now();
      const content = await watched();
      if (stopped || content === null || content === lastContent) return;
      const reconciled = await syncFieldsFromBoard(id, type);
      if (stopped) return;
      setFields(reconciled);
      // Recorded only after the reconcile lands. Setting it first meant a failed
      // reconcile still marked the content as seen, and every later read then
      // skipped it as unchanged — the watch stayed alive but did nothing.
      lastContent = content;
    };

    // Supervisor: a failed read must not become an unhandled rejection or stop
    // the timer. It reports and the next one tries the same content again.
    const supervised = () =>
      void read().catch((error) =>
        reportToLog('Could not re-read the selected element from the board', error),
      );

    // Debounced, so clicking about the panel collapses into a single read.
    const noteActivity = () => {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        supervised();
      }, SETTLE_MS);
    };
    window.addEventListener('focus', noteActivity);

    // The timer itself is free; only the read it guards costs anything, and it
    // fires just once per IDLE_FALLBACK_MS.
    const timer = window.setInterval(() => {
      if (!fallbackDue(Date.now(), lastRead)) return;
      supervised();
    }, FALLBACK_CHECK_MS);

    return () => {
      stopped = true;
      if (settleTimer !== null) clearTimeout(settleTimer);
      window.removeEventListener('focus', noteActivity);
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

  // The element the editor is showing right now, for write results that land
  // after the selection has moved on.
  const shownId = useRef<string | null>(null);
  useEffect(() => {
    shownId.current = target?.id ?? null;
  }, [target?.id]);

  // Write through to the board, and take the board's answer for it. The write is
  // abandoned rather than applied when the block's fields changed underneath this
  // editor — someone typed a line onto the block itself since it was loaded — in
  // which case what comes back is what the board holds, and that replaces what's
  // on screen. The edit is lost, which is the point: the alternative is deleting
  // the line they typed on the board, and this editor's copy is the stale one.
  //
  // Applied only while that element is still the one on screen: a write resolving
  // after the user has selected something else must not drop the old block's
  // fields into the new block's editor.
  const writeThrough = (t: FieldTarget, next: Field[]) =>
    saveFields(t.id, t.type, next)
      .then((outcome) => {
        if (outcome.applied) return nudgeCompleteness();
        if (shownId.current === t.id) setFields(outcome.board);
      })
      .catch(reportError);

  // Immediate persist (add / remove / type change). The list is the source of
  // truth while editing, so update locally first and write through.
  const save = (next: Field[]) => {
    setFields(next);
    if (target) void writeThrough(target, next);
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
    setOpenId(added.id); // a fresh field opens for editing right away
    save(next);
  };

  const persist = () => {
    if (target) void writeThrough(target, fields);
  };

  // Open a row's editor and put the cursor in its name input.
  const openRow = (id: string) => {
    setOpenId(id);
    pendingFocus.current = id;
  };

  // Close the open editor. Also persists: Escape closes without blurring the
  // focused input, so its blur-persist never fires — and the board watch
  // resumes once focus leaves the panel, which would otherwise overwrite the
  // unsaved edit with what the board still holds.
  const closeRow = () => {
    setOpenId(null);
    persist();
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
        {/* Not "every 15 seconds" any more: the retry stands down while the board
            is asking to be left alone, so the true gap is however long that lasts.
            Retry pushes through regardless — it's a thing the user asked for. */}
        <p className="footnote">Retrying on its own. See the Console tab.</p>
      </section>
    );
  }

  // Exactly one arrow selected: the tab becomes the arrow toolset (copy fields
  // across it, navigate to its ends). Only the single-connector selection —
  // with anything else alongside, the arrow is context, not the subject.
  if (selection.length === 1 && selection[0].kind === 'connector') {
    return <ArrowSection connectorId={selection[0].id} />;
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
            <FieldRow
              field={field}
              expanded={openId === field.id}
              onOpen={() => openRow(field.id)}
              onClose={closeRow}
              onEdit={(patch) => edit(field.id, patch)}
              onCommit={(patch) =>
                save(fields.map((f) => (f.id === field.id ? { ...f, ...patch } : f)))
              }
              onPersist={persist}
              onRemove={() => save(fields.filter((f) => f.id !== field.id))}
              onInsertBelow={() => insertBelow(field.id)}
              nameInputRef={(el) => {
                if (el) nameInputs.current.set(field.id, el);
                else nameInputs.current.delete(field.id);
              }}
              grip={reorder.handleProps(index)}
            />
          </div>
        ))}
      </div>

      <button
        className="field-add"
        type="button"
        onClick={() => {
          const added = newField();
          pendingFocus.current = added.id;
          setOpenId(added.id); // a fresh field opens for editing right away
          save([...fields, added]);
        }}
      >
        <span className="field-add-label">Add field</span>
        <span className="field-add-plus" aria-hidden="true">
          +
        </span>
      </button>
    </section>
  );
}
