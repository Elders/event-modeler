// Drag-to-reorder for a vertical list of rows, built on the native HTML5 drag
// events (no library). A row becomes draggable only while the pointer is held
// on its grip handle, so the text inputs inside a row keep their normal
// select-and-drag behavior. The hook tracks which row is being dragged and
// which slot the drop would land in; the caller styles the insertion point
// from `dropIndex` and commits the move through `onMove`. The grip also
// accepts arrow keys, so reordering works without a mouse.

import { useState, type DragEvent, type KeyboardEvent } from 'react';

export function useDragReorder(count: number, onMove: (from: number, to: number) => void) {
  // armed: the row whose grip is pressed (made draggable). dragIndex: the row
  // being dragged. dropIndex: the insertion slot (0..count) under the cursor.
  const [armed, setArmed] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const reset = () => {
    setArmed(null);
    setDragIndex(null);
    setDropIndex(null);
  };

  // The list container accepts the drop anywhere over it — including the gaps
  // between rows, where no row's own dragover fires — and commits the move.
  const listProps = {
    onDragOver: (event: DragEvent) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    onDrop: (event: DragEvent) => {
      if (dragIndex === null) return;
      event.preventDefault();
      if (dropIndex !== null) {
        // Slots are counted with the dragged row still in place; taking the
        // row out first shifts every slot after it down by one.
        const to = dropIndex > dragIndex ? dropIndex - 1 : dropIndex;
        if (to !== dragIndex) onMove(dragIndex, to);
      }
      reset();
    },
  };

  const rowProps = (index: number) => ({
    draggable: armed === index,
    onDragStart: (event: DragEvent) => {
      // Only a grip-initiated drag is ours. Dragging *selected text* inside a
      // row's input also fires a bubbled dragstart here — leave that native
      // drag alone instead of hijacking it as a reorder.
      if (armed !== index) return;
      // Firefox refuses to start a drag with no data attached.
      event.dataTransfer.setData('text/plain', '');
      event.dataTransfer.effectAllowed = 'move';
      setDragIndex(index);
    },
    onDragOver: (event: DragEvent) => {
      if (dragIndex === null) return;
      const rect = event.currentTarget.getBoundingClientRect();
      setDropIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
    },
    onDragEnd: reset,
  });

  const handleProps = (index: number) => ({
    onPointerDown: () => {
      setArmed(index);
      // Disarm on release wherever it lands: the grip has no pointer capture,
      // so a release outside it would otherwise leave the row draggable and
      // let a later text-selection drag from its inputs start a reorder.
      window.addEventListener('pointerup', () => setArmed(null), { once: true });
    },
    onKeyDown: (event: KeyboardEvent) => {
      const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : null;
      if (to === null || to < 0 || to >= count) return;
      event.preventDefault();
      onMove(index, to);
    },
  });

  return { dragIndex, dropIndex, listProps, rowProps, handleProps };
}
