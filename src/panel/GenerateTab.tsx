// The Generate tab: a source toggle over the two ways the AI drafts a model —
// from pasted text, or from a Figma file. Both produce the same model and share
// one build engine, so they live under one tab as two sources rather than two
// tabs. The toggle is locked while a build is running (busy) so a source switch
// can't unmount an in-flight run and strand its Pause control.

import './GenerateTab.css';
import { useState } from 'react';
import { GenerateSection } from './GenerateSection';
import { ImportFigmaSection } from './ImportFigmaSection';
import { ImportPdfSection } from './ImportPdfSection';
import type { Guard } from './useBusyGuard';

type Source = 'text' | 'figma' | 'pdf';

export function GenerateTab({ busy, guard }: { busy: boolean; guard: Guard }) {
  const [source, setSource] = useState<Source>('text');

  return (
    <>
      <div className="gen-source" role="tablist" aria-label="Model source">
        <button
          type="button"
          role="tab"
          aria-selected={source === 'text'}
          className={`gen-source-btn${source === 'text' ? ' gen-source-btn-active' : ''}`}
          disabled={busy}
          onClick={() => setSource('text')}
        >
          Text
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'figma'}
          className={`gen-source-btn${source === 'figma' ? ' gen-source-btn-active' : ''}`}
          disabled={busy}
          onClick={() => setSource('figma')}
        >
          Figma
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === 'pdf'}
          className={`gen-source-btn${source === 'pdf' ? ' gen-source-btn-active' : ''}`}
          disabled={busy}
          onClick={() => setSource('pdf')}
        >
          PDF
        </button>
      </div>

      {source === 'text' ? (
        <GenerateSection busy={busy} guard={guard} />
      ) : source === 'figma' ? (
        <ImportFigmaSection busy={busy} guard={guard} />
      ) : (
        <ImportPdfSection busy={busy} guard={guard} />
      )}
    </>
  );
}
