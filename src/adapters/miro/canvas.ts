// The Miro implementation of the Canvas port. This is the only module that
// knows the Miro Web SDK item model (mutate a live handle, then `sync()`).
//
// A handle cache keeps `apply`/`group`/`remove`/`addToContainer` from
// re-fetching items the use-case just queried, so a batch of moves is one
// round-trip per item — matching the hand-tuned original.

import type { ElementMeta } from '../../domain/meta';
import type {
  Canvas,
  CanvasElement,
  CardSpec,
  ContainerSpec,
  ElementKind,
  ElementPatch,
  ImageSpec,
  ShapeSpec,
  TextSpec,
} from '../../ports/canvas';
import { META_KEY } from './meta';

type LiveItem = Awaited<ReturnType<typeof miro.board.get>>[number];

// A loose read view over any live item — the SDK union mixes members with and
// without geometry, so we read fields defensively.
type ReadView = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  parentId?: string | null;
  content?: unknown;
  title?: unknown;
  style?: { fillColor?: string };
};

// A loose write view for applying patches.
type WriteView = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  content?: string;
  style?: { fillColor?: string };
  sync(): Promise<unknown>;
};

// Miro rate-limits writes (HTTP 429). A single user action never approaches the
// limit, but a bulk operation (generating a whole model) can — so every write
// goes through this backoff. Reads are left alone; the limit bites on creates.
function isRateLimited(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429) return true;
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('429') || message.includes('too many requests') || message.includes('rate limit');
}

const RETRY_DELAYS_MS = [500, 1000, 2000, 4000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRateLimited(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

function kindOf(type: string): ElementKind {
  switch (type) {
    case 'sticky_note':
      return 'card';
    case 'image':
      return 'image';
    case 'text':
      return 'text';
    case 'frame':
      return 'container';
    case 'shape':
      return 'shape';
    case 'connector':
      return 'connector';
    default:
      return 'unknown';
  }
}

export class MiroCanvas implements Canvas {
  private items = new Map<string, LiveItem>();

  private cache(item: LiveItem): LiveItem {
    this.items.set(item.id, item);
    return item;
  }

  private cacheAll(items: LiveItem[]): LiveItem[] {
    for (const item of items) this.items.set(item.id, item);
    return items;
  }

  // Ensures every id is in the cache, fetching the missing ones.
  private async ensureLive(ids: string[]): Promise<void> {
    const missing = ids.filter((id) => !this.items.has(id));
    if (missing.length === 0) return;
    try {
      this.cacheAll(await miro.board.get({ id: missing }));
    } catch (error) {
      console.warn('Could not fetch board items', error);
    }
  }

  private snap(item: LiveItem): CanvasElement {
    const a = item as unknown as ReadView;
    return {
      id: a.id,
      kind: kindOf(a.type),
      x: a.x ?? 0,
      y: a.y ?? 0,
      width: a.width ?? 0,
      height: a.height ?? 0,
      parentId: 'parentId' in a ? (a.parentId ?? null) : null,
      content: typeof a.content === 'string' ? a.content : null,
      color: a.style && typeof a.style.fillColor === 'string' ? a.style.fillColor : null,
      title: typeof a.title === 'string' ? a.title : null,
    };
  }

  async createCard(spec: CardSpec): Promise<CanvasElement> {
    type Arg = Parameters<typeof miro.board.createStickyNote>[0];
    const sticky = this.cache(
      await withRetry(() =>
        miro.board.createStickyNote({
          x: spec.x,
          y: spec.y,
          shape: 'square',
          width: spec.width,
          content: spec.content,
          style: { fillColor: spec.color },
          ...(spec.link ? { linkedTo: spec.link } : {}),
        } as Arg),
      ),
    );
    return this.snap(sticky);
  }

  async createImage(spec: ImageSpec): Promise<CanvasElement> {
    const image = this.cache(
      await withRetry(() =>
        miro.board.createImage({ url: spec.url, x: spec.x, y: spec.y, width: spec.width }),
      ),
    );
    return this.snap(image);
  }

  async createText(spec: TextSpec): Promise<CanvasElement> {
    type Arg = Parameters<typeof miro.board.createText>[0];
    const text = this.cache(
      await withRetry(() =>
        miro.board.createText({
          content: spec.content,
          x: spec.x,
          y: spec.y,
          width: spec.width,
          style: {
            color: spec.color ?? '#9c9cac',
            fontSize: spec.fontSize ?? 14,
            textAlign: spec.align ?? 'left',
          },
        } as Arg),
      ),
    );
    return this.snap(text);
  }

  async createContainer(spec: ContainerSpec): Promise<CanvasElement> {
    type Arg = Parameters<typeof miro.board.createFrame>[0];
    // The live SDK requires `style.fillColor` (the published typings mark it
    // optional) and rejects a `content` property outright.
    const frame = this.cache(
      await withRetry(() =>
        miro.board.createFrame({
          title: spec.title,
          x: spec.x,
          y: spec.y,
          width: spec.width,
          height: spec.height,
          style: { fillColor: spec.fill },
        } as Arg),
      ),
    );
    return this.snap(frame);
  }

  async createShape(spec: ShapeSpec): Promise<CanvasElement> {
    type Arg = Parameters<typeof miro.board.createShape>[0];
    const shape = this.cache(
      await withRetry(() =>
        miro.board.createShape({
          shape: spec.shape,
          x: spec.x,
          y: spec.y,
          width: spec.width,
          height: spec.height,
          content: spec.content ?? '',
          style: {
            fillColor: spec.fill,
            fillOpacity: spec.fillOpacity,
            borderColor: spec.borderColor,
            borderWidth: spec.borderWidth,
            color: spec.textColor,
            fontSize: spec.fontSize,
            textAlign: spec.textAlign,
            textAlignVertical: spec.textAlignVertical,
          },
        } as Arg),
      ),
    );
    return this.snap(shape);
  }

  async createLink(fromId: string, toId: string): Promise<void> {
    // No shape or style overrides: stamped links use the SDK defaults, so they
    // are indistinguishable from manually drawn ones.
    await withRetry(() =>
      miro.board.createConnector({ start: { item: fromId }, end: { item: toId } }),
    );
  }

  async get(ids: string[]): Promise<CanvasElement[]> {
    if (ids.length === 0) return [];
    const items = this.cacheAll(await miro.board.get({ id: ids }));
    return items.map((item) => this.snap(item));
  }

  async containers(): Promise<CanvasElement[]> {
    const frames = this.cacheAll(await miro.board.get({ type: 'frame' }));
    return frames.map((frame) => this.snap(frame));
  }

  async childrenOf(containerId: string): Promise<CanvasElement[]> {
    await this.ensureLive([containerId]);
    const frame = this.items.get(containerId) as unknown as
      | { getChildren?: () => Promise<LiveItem[]> }
      | undefined;
    if (!frame?.getChildren) return [];
    const children = this.cacheAll(await frame.getChildren());
    return children.map((child) => this.snap(child));
  }

  async selection(): Promise<CanvasElement[]> {
    const items = this.cacheAll(await miro.board.getSelection());
    return items.map((item) => this.snap(item));
  }

  async apply(patches: ElementPatch[]): Promise<void> {
    if (patches.length === 0) return;
    await this.ensureLive(patches.map((patch) => patch.id));
    const syncs: Promise<unknown>[] = [];
    for (const patch of patches) {
      const item = this.items.get(patch.id);
      if (!item) continue;
      const w = item as unknown as WriteView;
      if (patch.x !== undefined) w.x = patch.x;
      if (patch.y !== undefined) w.y = patch.y;
      if (patch.width !== undefined && 'width' in item) w.width = patch.width;
      if (patch.height !== undefined && 'height' in item) w.height = patch.height;
      if (patch.content !== undefined && 'content' in item) w.content = patch.content;
      if (patch.color !== undefined && w.style) w.style.fillColor = patch.color;
      syncs.push(withRetry(() => w.sync()));
    }
    await Promise.all(syncs);
  }

  async addToContainer(
    containerId: string,
    childId: string,
    relX: number,
    relY: number,
  ): Promise<void> {
    await this.ensureLive([containerId, childId]);
    const frame = this.items.get(containerId) as unknown as
      | { add?: (item: LiveItem) => Promise<unknown> }
      | undefined;
    const child = this.items.get(childId);
    if (!frame?.add || !child) return;
    try {
      await withRetry(() => frame.add!(child));
      const w = child as unknown as WriteView;
      w.x = relX;
      w.y = relY;
      await withRetry(() => w.sync());
    } catch (error) {
      // Re-parenting can fail; the child keeps the absolute position it was
      // created at, so the layout is still right.
      console.warn('Could not add an element to its container', error);
    }
  }

  async group(ids: string[]): Promise<void> {
    await this.ensureLive(ids);
    const items = ids.map((id) => this.items.get(id)).filter((item): item is LiveItem => !!item);
    if (items.length < 2) return;
    try {
      await miro.board.group({
        items: items as unknown as Parameters<typeof miro.board.group>[0]['items'],
      });
    } catch (error) {
      console.warn('Could not group elements', error);
    }
  }

  async remove(id: string): Promise<void> {
    await this.ensureLive([id]);
    const item = this.items.get(id);
    if (!item) return;
    try {
      await miro.board.remove(item);
      this.items.delete(id);
    } catch (error) {
      console.warn('Could not remove an element', error);
    }
  }

  async setMeta(id: string, meta: ElementMeta): Promise<void> {
    await this.ensureLive([id]);
    const item = this.items.get(id) as unknown as
      | { setMetadata?: (key: string, value: unknown) => Promise<unknown> }
      | undefined;
    if (!item?.setMetadata) return;
    await withRetry(() => item.setMetadata!(META_KEY, meta));
  }

  async getMeta(id: string): Promise<ElementMeta | null> {
    await this.ensureLive([id]);
    const item = this.items.get(id) as unknown as
      | { getMetadata?: (key: string) => Promise<unknown> }
      | undefined;
    if (!item?.getMetadata) return null;
    try {
      return ((await item.getMetadata(META_KEY)) as ElementMeta | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async settle(id: string, absX: number, absY: number): Promise<void> {
    // Items created over a frame can get captured by it, their coordinates
    // ending up parent-relative while we supplied absolute — re-pin them.
    try {
      const [fresh] = await miro.board.get({ id: [id] });
      if (!fresh) return;
      this.cache(fresh);
      const view = fresh as unknown as ReadView;
      if (!('parentId' in view) || !view.parentId) return;
      const [parent] = await miro.board.get({ id: [view.parentId] });
      if (!parent || parent.type !== 'frame') return;
      const p = parent as unknown as ReadView;
      const w = fresh as unknown as WriteView;
      w.x = absX - ((p.x ?? 0) - (p.width ?? 0) / 2);
      w.y = absY - ((p.y ?? 0) - (p.height ?? 0) / 2);
      await withRetry(() => w.sync());
    } catch (error) {
      console.warn('Could not settle a created element into its frame', error);
    }
  }

  async deselect(): Promise<void> {
    await miro.board.deselect();
  }

  async deepLink(id: string): Promise<string | null> {
    try {
      const info = await miro.board.getInfo();
      return `https://miro.com/app/board/${info.id}/?moveToWidget=${id}`;
    } catch (error) {
      console.warn('Could not resolve the board id for an element link', error);
      return null;
    }
  }
}
