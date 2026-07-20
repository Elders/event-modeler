// One field in the Fields editor — an accordion row. Collapsed, it shows the
// field exactly as the board renders it (the "from > name : type[]!?"
// notation, alias and marks tinted) on a single quiet line; open, it becomes
// the editor card: name + type on the first line, the four modifier marks as
// one segmented control below, and the custom-type / fed-by inputs beneath
// when they apply. The section owns which row is open (one at a time); this
// component just reports clicks. A collapsed row opens on click; the open
// card closes on Escape or a click on its own background — the controls
// inside swallow their clicks, so only the card's padding closes it.

import './FieldRow.css';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  FIELD_TYPES,
  cleanFieldName,
  fieldAlias,
  fieldAliasNames,
  fieldTypeLabel,
  type Field,
  type FieldType,
} from '../features/fields/model';

// The reorder grip's spreadable props (useDragReorder.handleProps): arm the
// row for dragging on pointer-down, move it with arrow keys.
type GripProps = {
  onPointerDown: () => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
};

interface FieldRowProps {
  field: Field;
  expanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  // Local-only update (typing in an input; committed later by onPersist).
  onEdit: (patch: Partial<Field>) => void;
  // Update-and-save, for one-click changes (type select, the mark toggles).
  onCommit: (patch: Partial<Field>) => void;
  // Write the list as it stands (input blur).
  onPersist: () => void;
  onRemove: () => void;
  // Enter in the name input: insert a fresh field right below this one.
  onInsertBelow: () => void;
  // Registers the name input so the section can focus a freshly opened row.
  nameInputRef: (el: HTMLInputElement | null) => void;
  grip: GripProps;
}

// The collapsed line, rendered from the Field rather than by re-parsing
// formatField's string, so the parts can be tinted individually. Same order
// formatField writes: aliases > name : type, then the marks "[]!?".
function Notation({ field }: { field: Field }) {
  const aliases = fieldAliasNames(field);
  const marks = `${field.collection ? '[]' : ''}${field.generated ? '!' : ''}${field.optional ? '?' : ''}`;
  return (
    <span className="field-notation">
      {aliases.length > 0 && <span className="field-notation-alias">{aliases.join(', ')} &gt; </span>}
      {field.name ? (
        field.name
      ) : (
        <span className="field-notation-unnamed">unnamed</span>
      )}
      <span className="field-notation-type"> : {fieldTypeLabel(field)}</span>
      {marks.length > 0 && <span className="field-notation-marks">{marks}</span>}
    </span>
  );
}

// True when the event's target is one of the row's own controls, whose clicks
// must not open or close the row.
function onControl(event: ReactMouseEvent): boolean {
  return event.target instanceof Element && event.target.closest('button, input, select') !== null;
}

export function FieldRow(props: FieldRowProps) {
  const { field, expanded } = props;

  const gripButton = (
    <button
      className="field-grip"
      type="button"
      aria-label="Move field (drag, or arrow keys)"
      title="Drag to reorder"
      {...props.grip}
    >
      ⠿
    </button>
  );

  if (!expanded) {
    return (
      <div
        className="field-closed"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (!onControl(e)) props.onOpen();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          props.onOpen();
        }}
      >
        {gripButton}
        <Notation field={field} />
        <span className="field-chevron" aria-hidden="true">
          ▸
        </span>
      </div>
    );
  }

  return (
    <div
      className="field-editor"
      onClick={(e) => {
        if (!onControl(e)) props.onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        props.onClose();
      }}
    >
      <div className="field-line">
        {gripButton}
        <input
          className="field-input field-name"
          placeholder="name"
          value={field.name}
          ref={props.nameInputRef}
          // A colon separates the name from the type on the board, so it is
          // not a name character — dropped as typed or pasted, rather than
          // accepted here and silently eaten by the parser on the way back.
          onChange={(e) => props.onEdit({ name: cleanFieldName(e.target.value) })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            props.onInsertBelow();
          }}
          onBlur={props.onPersist}
        />
        <select
          className="field-input field-type"
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as FieldType;
            props.onCommit({ type, customType: type === 'custom' ? field.customType : undefined });
          }}
        >
          {FIELD_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="field-remove"
          type="button"
          aria-label="Remove field"
          onClick={props.onRemove}
        >
          ×
        </button>
      </div>
      {/* The four marks as one segmented control, in the order they render on
          the board: "type[]!?", then the alias arrow. "[]" = a collection of
          the type; "!" = generated — synthesized by the block at runtime,
          excluded from what its incoming arrows must supply but still a
          guaranteed supply downstream; "?" = optional; "→" reveals the
          "fed by" input below. */}
      <div className="field-line field-line-indent">
        <div className="field-marks">
          <button
            className={field.collection ? 'on' : ''}
            type="button"
            aria-pressed={!!field.collection}
            aria-label="Collection field"
            title="Collection — many of the type, not one. Shown as [] after the type."
            onClick={() => props.onCommit({ collection: !field.collection })}
          >
            []
          </button>
          <button
            className={field.generated ? 'on' : ''}
            type="button"
            aria-pressed={!!field.generated}
            aria-label="Generated field"
            title="Generated — synthesized at runtime, not required from incoming blocks. Shown as a ! after the type."
            onClick={() => props.onCommit({ generated: !field.generated })}
          >
            !
          </button>
          <button
            className={field.optional ? 'on' : ''}
            type="button"
            aria-pressed={!!field.optional}
            aria-label="Optional field"
            title="Optional — shown as a ? after the type"
            onClick={() => props.onCommit({ optional: !field.optional })}
          >
            ?
          </button>
          {/* Labelled with the glyph, not the ">" the board renders: this is
              clicked, never typed, so it can afford to read better than it
              types. Turning it on changes nothing on the board — an alias
              naming nothing renders no arrow — so it stays local rather than
              spending a board round-trip on a UI toggle. Turning off an alias
              that named a field is a real edit. */}
          <button
            className={field.from !== undefined ? 'on' : ''}
            type="button"
            aria-pressed={field.from !== undefined}
            aria-label="Fed by an upstream field of another name"
            title="Fed by — one or more upstream fields of another name supply this one"
            onClick={() => {
              const on = field.from !== undefined;
              if (on && fieldAlias(field)) props.onCommit({ from: undefined });
              else props.onEdit({ from: on ? undefined : '' });
            }}
          >
            →
          </button>
        </div>
      </div>
      {field.type === 'custom' && (
        <input
          className="field-input field-custom field-line-indent"
          placeholder="type name"
          value={field.customType ?? ''}
          onChange={(e) => props.onEdit({ customType: e.target.value })}
          onBlur={props.onPersist}
        />
      )}
      {field.from !== undefined && (
        <input
          className="field-input field-from field-line-indent"
          placeholder="fed by → (comma-separate multiple)"
          title="One or more upstream field names, comma-separated — any one satisfies this field"
          value={field.from}
          // An alias is a field name like any other, and is eaten by the
          // parsers the same way, so it goes through the same cleaning.
          onChange={(e) => props.onEdit({ from: cleanFieldName(e.target.value) })}
          onBlur={props.onPersist}
        />
      )}
    </div>
  );
}
