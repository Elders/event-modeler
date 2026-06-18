// The Fields editor: reacts to the board selection and lets the user define
// fields on the selected block. Resolves the first fieldable element in the
// selection (a screen's box/title share the group, so we scan past them via
// each item's meta), shows a name input + type picker per field, and persists
// every change through the fields use-case. Persistence is serialized in
// features/fields/edit, so we save optimistically without a busy lock.

import './FieldsSection.css';
import { useEffect, useRef, useState } from 'react';
import { BLOCKS, type BlockType } from '../domain/vocabulary';
import { reportError } from '../features/helpers';
import { setFields as saveFields } from '../features/fields/edit';
import { syncFieldsFromText } from '../features/fields/sync';
import {
  FIELD_TYPES,
  displayMode,
  isFieldable,
  newField,
  type Field,
  type FieldType,
} from '../features/fields/model';
import { services } from '../services';
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
      const { canvas } = services();
      let found: { id: string; type: BlockType } | null = null;
      for (const item of selection) {
        const meta = await canvas.getMeta(item.id);
        if (meta && isFieldable(meta.type)) {
          found = { id: item.id, type: meta.type };
          break;
        }
      }
      if (cancelled) return;
      setTarget(found);
      const foundId = found?.id ?? null;
      if (foundId === loadedId.current) return;
      loadedId.current = foundId;
      // Pull any fields the user typed directly on the element into the registry
      // (text mode); box-mode blocks just read their stored fields.
      const loaded = found ? await syncFieldsFromText(found.id, found.type) : [];
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
      const reconciled = await syncFieldsFromText(id, type);
      if (!stopped) setFields(reconciled);
    };
    const timer = window.setInterval(() => void tick(), 800);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [target?.id, target?.type]);

  // Immediate persist (add / remove / type change). The list is the source of
  // truth while editing, so update locally first and write through.
  const save = (next: Field[]) => {
    setFields(next);
    if (target) void saveFields(target.id, target.type, next).catch(reportError);
  };

  // Local-only update while typing a text input; committed on blur.
  const edit = (id: string, patch: Partial<Field>) =>
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));

  const persist = () => {
    if (target) void saveFields(target.id, target.type, fields).catch(reportError);
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

      <div className="fields-list">
        {fields.map((field) => (
          <div className="field-row" key={field.id}>
            <input
              className="field-input field-name"
              placeholder="name"
              value={field.name}
              onChange={(e) => edit(field.id, { name: e.target.value })}
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
