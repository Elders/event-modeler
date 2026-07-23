// The display-name convention for elements whose name lives in their own text:
// the name is the first line, and everything after it is body — a sticky's
// field lines, a note's prose. Pure domain, no platform reference.
//
// This deliberately does NOT round-trip the body through any parser: renaming a
// note must not reformat its sentences as field lines, so the rename rewrites
// the first line and keeps the rest byte-for-byte.

import { escapeHtml } from './fields';

// Replaces the first line of an HTML text fragment with the given name. The
// first line ends at the first paragraph close or line break — the same split
// htmlToParagraphs uses — and is rewritten as a clean paragraph; content with
// no break at all IS the name line and is replaced whole. A <br>-separated
// fragment keeps its un-paragraphed shape rather than mixing <p> into it.
export function replaceFirstLine(content: string | null, name: string): string {
  const head = `<p>${escapeHtml(name)}</p>`;
  if (!content) return head;
  const brk = content.match(/<\/p>|<br\s*\/?>/i);
  if (!brk || brk.index === undefined) return head;
  const rest = content.slice(brk.index + brk[0].length);
  if (brk[0].toLowerCase().startsWith('<br')) return `${escapeHtml(name)}${brk[0]}${rest}`;
  return `${head}${rest}`;
}
