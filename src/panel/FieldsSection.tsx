// The Fields editor: reacts to the board selection and lets the user define
// fields on the selected block. Resolves the first fieldable element in the
// selection (a screen's box/title share the group, so we scan past them via
// each item's meta), shows a grip + name input + type picker per field —
// rows reorder by dragging the grip (or arrow keys on it) — and persists
// every change through the fields use-case. Persistence is serialized in
// features/fields/edit, so we save optimistically without a busy lock.

import './FieldsSection.css';
import { useEffect, useRef, useState } from 'react';
import { BLOCKS, type BlockType } from '../domain/vocabulary';
import { completenessHousekeeping } from '../features/completeness';
import { reportError } from '../features/helpers';
import { setFields as saveFields } from '../features/fields/edit';
import { resolveFieldTarget } from '../features/fields/recognize';
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

function blockLabel(type: BlockType): string {
  return BLOCKS.find((block) => block.type === type)?.label ?? type;
}

export function FieldsSection() {
  const selection = useSelection();
  const selectionKey = selection.map((item) => item.id).join(',');
  const [target, setTarget] = useState<{ id: string; type: BlockType } | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  // The element whose fields are currently loaded into the editor. Reloading is
  // gated on this so a spurious selection re-fire (or a slow registry read
  // landing after an edit) can't clobber what the user is actively editing.
  const loadedId = useRef<string | null>(null);

  // Re-resolve the target whenever the selected ids change; reload its fields
  // only when the resolved target is a *different* element.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await resolveFieldTarget(selection);
      if (cancelled) return;
      setTarget(found);
      const foundId = found?.id ?? null;
      if (foundId === loadedId.current) return;
      loadedId.current = foundId;
      // Reconcile the on-board display back into the registry: parse fields the
      // user typed on a sticky (text mode), or recover a box-mode block's fields
      // from its attached box when its registry record was lost.
      const loaded = found ? await syncFieldsFromBoard(found.id, found.type) : [];
      if (cancelled) return;
      setFields(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectionKey]);

  // While a text-mode element stays selected, reflect edits made directly on the
  // canvas: Miro fires no item-update event, so poll the element's text and
  // reconcile when it changes. Skipped while a panel input is focused, so a
  // canvas poll can never clobber what the user is typing here.
  useEffect(() => {
    if (!target || displayMode(target.type) !== 'text') return;
    const { id, type } = target;
    let stopped = false;
    let lastContent: string | null = null;
    const tick = async () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.classList.contains('field-input')) return;
      const [element] = await services().canvas.get([id]);
      if (stopped || !element || element.content === lastContent) return;
      lastContent = element.content;
      const reconciled = await syncFieldsFromBoard(id, type);
      if (!stopped) setFields(reconciled);
    };
    // Poll slowly: this only catches fields typed directly onto the sticky (the
    // panel inputs update immediately on their own), so a relaxed cadence keeps
    // it from being a constant drain on the shared API budget while selected.
    const timer = window.setInterval(() => void tick(), 2500);
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
