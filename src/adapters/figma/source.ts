// The Figma implementation of the DesignSource port. It fetches a file, walks it
// into frames + flow edges (extract.ts), renders those frames to PNGs, and hands
// the loosely-shaped result to the domain's normalizeDesignDoc — the trust
// boundary — for a safe DesignDoc. The token comes from browser-local settings
// (the user's own key), same as the Planner.

import { normalizeDesignDoc, type DesignDoc } from '../../domain/designDoc';
import type { DesignSource, DesignSourceSettings } from '../../ports/designSource';
import { fetchFigmaFile, fetchFigmaImages, FIGMA_API_BASE } from './client';
import { extractDesign, extractImageUrls } from './extract';
import { readSettings, writeSettings } from './settings';

// A successful read is reused for a short window, so retries and re-imports of
// the same file don't re-spend Figma's cost-weighted budget. Kept short because a
// frame's render URL is temporary — within this window Miro still fetches it at
// build time; past it, re-read to get fresh URLs.
const CACHE_TTL_MS = 5 * 60 * 1000;

// Where the Figma REST calls go. Figma's API sends `access-control-allow-origin:
// *`, so a browser can call it directly cross-origin — which is exactly what a
// static production build does, and it works. So the default is direct. An
// explicit proxyUrl overrides it, for a user whose network genuinely blocks
// api.figma.com (their own hosted shim). The dev Vite proxy at `/figma` is left
// in place as an opt-in target for that override, but is NOT used automatically:
// forwarding Figma's large chunked responses through it proved unreliable — the
// headers arrived but the body did not.
function figmaBase(proxyUrl?: string): string {
  return proxyUrl && proxyUrl.trim() ? proxyUrl.trim() : FIGMA_API_BASE;
}

export class FigmaDesignSource implements DesignSource {
  // Per-file-key cache, alive for the panel session (a full reload clears it).
  private readonly cache = new Map<string, { doc: DesignDoc; at: number }>();

  getSettings(): DesignSourceSettings {
    return readSettings();
  }

  setSettings(settings: DesignSourceSettings): void {
    writeSettings(settings);
  }

  async fetchDesign(fileKey: string, signal?: AbortSignal): Promise<DesignDoc> {
    const { token, proxyUrl } = readSettings();
    const key = token.trim();
    if (!key) throw new Error('Add your Figma access token in the panel settings first.');

    const cached = this.cache.get(fileKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.doc;

    const base = figmaBase(proxyUrl);

    // One file read. Figma's file-content limit is a request *count* (as low as
    // 6/month on a View/Collab seat), so a single call beats splitting into a
    // shallow list + a /nodes deep-read; the cache below then spares repeats.
    const fileBody = await fetchFigmaFile(base, fileKey, key, signal);
    const { frames, edges } = extractDesign(fileBody);

    // Render the frames to PNGs. A missing url (Figma couldn't render a frame) is
    // a value — that screen falls back to a placeholder — not a failure.
    const renderByRef = new Map<string, string | null>();
    if (frames.length > 0) {
      const imagesBody = await fetchFigmaImages(base, fileKey, frames.map((f) => f.id), key, signal);
      const urls = extractImageUrls(imagesBody);
      for (const frame of frames) renderByRef.set(frame.ref, urls[frame.id] ?? null);
    }

    const doc = normalizeDesignDoc({
      frames: frames.map((frame) => ({
        ref: frame.ref,
        name: frame.name,
        labels: frame.labels,
        renderUrl: renderByRef.get(frame.ref) ?? null,
      })),
      edges,
    });
    this.cache.set(fileKey, { doc, at: Date.now() });
    return doc;
  }
}
