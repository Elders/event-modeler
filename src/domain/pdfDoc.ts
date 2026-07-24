// The vision-import domain: a design exported as PDF pages, fed to the planner as
// images. Pure — the PdfPage shape, the system-prompt addendum that teaches how
// to read those pages, and the text that accompanies the images. No platform
// deps (pdf.js lives in adapters/pdf; the multimodal call in the planner).
//
// This path exists because a static export drops the prototype flow graph — so
// the model is inferred from the screens' content, their order, and any NOTE
// pages the designer wrote (which often describe the flow the export lost).

export interface PdfPage {
  index: number; // 0-based page number, in document order
  png: string; // base64-encoded PNG of the rendered page (no data: prefix)
  text: string; // the page's extracted text layer; may be empty (outlined text)
}

// Appended to the planner's system prompt for a PDF import only. The shared
// preamble teaches the modeling vocabulary + output contract; this teaches how
// to read the pages — crucially, that some pages are screens and some are the
// designer's explanatory notes, and that the flow must be inferred.
export const VISION_ADDENDUM = `This request comes from static page exports of a design (a PDF's pages), not a live prototype — there is NO click-through wiring, so you infer the flow. The attached images are the pages, in order.

First, classify each page:
- A UI SCREEN (a mockup: layout, buttons, forms, lists). Make a screen block for it, and set that block's ref to "screen-page-N", where N is the page's 1-based number in attachment order, so its render can be attached.
- A NOTE page the designer added (mostly prose: explanations, business rules, flow descriptions, legends). Do NOT make it a screen block. Read it as context — it describes intent, rules, and how screens connect — and use it to drive the commands, events, read models, automations, fields, and the ordering of slices.

Then build the model:
- Infer the flow from the notes, the page order, and on-screen cues (a "Place order" button, a link to another screen): a user action on a screen is a command that emits an event, which updates the read model the next screen shows.
- When a note states a rule or a transition, prefer it over a guess.
- Read each screen's visible labels (form inputs, headings, list columns) as data — but attach those fields to the COMMAND the screen submits or the READ MODEL it displays, NOT to the screen block itself. In event modeling the data lives on commands, events, and read models; leave screen and automation blocks WITHOUT their own fields. (This also keeps the model within the board's storage budget: a sticky block's fields are free, a screen's are not.)`;

// The text block sent alongside the page images: the per-page extracted text, so
// the model has the exact words even where a render is low-res or a note is dense.
const MAX_PAGE_TEXT = 1200; // bound the prompt; the image carries the full content

export function describePdfPages(pages: PdfPage[]): string {
  // Numbered by position in this array — the same order the images are attached —
  // so "Page N" here and the addendum's "screen-page-N" ref agree.
  const lines = pages.map((page, i) => {
    const text = page.text
      ? page.text.slice(0, MAX_PAGE_TEXT)
      : '(no extractable text — read it from the image)';
    return `Page ${i + 1}:\n${text}`;
  });
  return (
    `The design was exported as ${pages.length} page${pages.length === 1 ? '' : 's'}, ` +
    `attached as images in order. Some are UI screens, some may be the designer's ` +
    `explanation notes — classify each per the instructions. Each page's extracted ` +
    `text follows, to supplement the images:\n\n${lines.join('\n\n')}`
  );
}
