// Draft a model from a design exported as PDF pages, via vision. A sibling of
// generateModel/importFromFigma: it renders the PDF to page images (through the
// PdfReader port), asks the same Planner to read them (multimodal), then hands
// the plan to the shared build engine — so checkpointing and resume come along.
//
// Because a static export has no prototype wiring, the flow is inferred from the
// screens and any NOTE pages the designer wrote (see VISION_ADDENDUM). It needs
// only the Anthropic key (no Figma token) — the PDF is a local upload.

import { describePdfPages, VISION_ADDENDUM } from '../domain/pdfDoc';
import { buildFromPlan } from './generate';
import { requirePdfReader, requirePlanner } from './helpers';

const aborted = (signal?: AbortSignal): boolean => signal?.aborted === true;

export async function importFromPdf(data: ArrayBuffer, signal?: AbortSignal): Promise<void> {
  // Keep only pages that rendered — a page with no image can't be a vision input,
  // and dropping it here keeps the images aligned with describePdfPages' numbering.
  const pages = (await requirePdfReader().read(data, signal)).filter((page) => page.png.length > 0);
  if (aborted(signal)) return;
  if (pages.length === 0) throw new Error('Could not render any pages from that PDF.');

  const plan = await requirePlanner().planFromImages(
    pages.map((page) => page.png),
    describePdfPages(pages),
    signal,
    VISION_ADDENDUM,
  );
  if (aborted(signal)) return;

  // Spike limitation: screen renders are NOT bound yet. A full-page PNG as a data
  // URL is far too large to ride in the ModelPlan, which is checkpointed to board
  // app data (~tens-of-KB budget) — so screens build as placeholders for now.
  // Binding the real page render needs a non-checkpointed path (the next step).
  await buildFromPlan(plan, signal);
}
