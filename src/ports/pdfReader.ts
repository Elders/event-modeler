// The PdfReader port: turns an uploaded PDF into rendered pages (image + text)
// for the vision import. One implementation today (pdf.js in adapters/pdf); the
// abstraction keeps the feature free of the PDF library, same as every other
// platform capability.

import type { PdfPage } from '../domain/pdfDoc';

export interface PdfReader {
  // Render + extract each page of the PDF. THROWS with a user-facing message on a
  // malformed or unreadable file — never returns an empty list to mean "failed"
  // (an empty list means the PDF genuinely had no pages).
  read(data: ArrayBuffer, signal?: AbortSignal): Promise<PdfPage[]>;
}
