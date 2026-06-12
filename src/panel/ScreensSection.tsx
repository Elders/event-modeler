// Screen tools: upload a capture or drop a blank sketch surface.

import { useRef, type ChangeEvent } from 'react';
import { createBlockAtCenter } from '../features/createBlock';
import { placeScreenImage } from '../features/screens';
import type { Guard } from './useBusyGuard';

export function ScreensSection({ busy, guard }: { busy: boolean; guard: Guard }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    const name = file.name.replace(/\.[^.]+$/, '');
    reader.onload = guard(async () => {
      await placeScreenImage(reader.result as string, name);
    });
    reader.readAsDataURL(file);
  };

  return (
    <section className="section">
      <h2 className="section-title">Screens</h2>
      <p className="section-sub">Wireframe sketches or real captures</p>
      <div className="button-row">
        <button
          className="button button-secondary button-small"
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Upload image
        </button>
        <button
          className="button button-secondary button-small"
          type="button"
          disabled={busy}
          onClick={guard(() => createBlockAtCenter('screen'))}
        >
          Blank sketch
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUploadChange} />
      <p className="footnote">
        Sketch over the white area with the pen tool (P). To paste a screenshot, click the board
        first, then press Ctrl+V.
      </p>
    </section>
  );
}
