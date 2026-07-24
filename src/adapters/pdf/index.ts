// The pdf.js implementation of the PdfReader port — the only place pdf.js
// appears. pdf.js is heavy (~1 MB), so it is loaded lazily on first use via a
// dynamic import, which Vite code-splits out of the main panel bundle: the
// board script and a panel that never imports a PDF never pay for it.
//
// Each page is rendered to a canvas and read out as a base64 PNG (the vision
// input), and its text layer is extracted to accompany the image. Propagates:
// pdf.js throws on a malformed file, and that throw is the honest answer.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfPage } from '../../domain/pdfDoc';
import type { PdfReader } from '../../ports/pdfReader';

// Bounds so one huge PDF can't blow out vision cost or memory (Phase 1).
const MAX_PAGES = 30;
const TARGET_WIDTH = 1100; // render width in px; Claude downsamples larger images

// Lazily import pdf.js and point it at its worker (bundled by Vite as a URL).
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

class PdfjsReader implements PdfReader {
  async read(data: ArrayBuffer, signal?: AbortSignal): Promise<PdfPage[]> {
    const pdfjs = await loadPdfjs();
    // A copy: pdf.js takes ownership of the buffer, and the caller's may be reused.
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
    const doc = await loadingTask.promise;
    try {
      const count = Math.min(doc.numPages, MAX_PAGES);
      const pages: PdfPage[] = [];
      for (let i = 1; i <= count; i++) {
        if (signal?.aborted) break;
        pages.push(await this.readPage(doc, i));
      }
      return pages;
    } finally {
      await loadingTask.destroy();
    }
  }

  private async readPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PdfPage> {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, TARGET_WIDTH / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get a 2D canvas to render the PDF.');
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    const png = canvas.toDataURL('image/png').split(',')[1] ?? '';

    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { index: pageNumber - 1, png, text };
  }
}

export function createPdfReader(): PdfReader {
  return new PdfjsReader();
}
