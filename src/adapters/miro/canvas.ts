// The Miro implementation of the Canvas port. This is the only module that
// knows the Miro Web SDK item model (mutate a live handle, then `sync()`).
//
// A handle cache keeps `apply`/`group`/`remove`/`addToContainer` from
// re-fetching items the use-case just queried, so a batch of moves is one
// round-trip per item — matching the hand-tuned original.

import type { ElementMeta } from '../../domain/meta';
import type {
  ArrowSpec,
  Canvas,
  CanvasConnector,
  CanvasElement,
  CanvasGroup,
  CardSpec,
  ContainerSpec,
  ElementKind,
  ElementPatch,
  ImageSpec,
  ShapeSpec,
  TextSpec,
} from '../../ports/canvas';
import { META_KEY } from './meta';
import { isUnderRateLimit as underRateLimit, setBulkWrites, withRateLimit } from './rateLimit';
import type { MiroOp } from './weights';

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
  style?: { fillColor?: string; fontSize?: number; textAlign?: string; textAlignVertical?: string };
  sync(): Promise<unknown>;
};

// The item types that can carry app metadata, by the SDK's own type strings.
// From the Web SDK reference: supported on card, connector, embed, image,
// preview, shape, sticky note and text — and NOT on frames, groups, or item
// types the SDK doesn't model. An allowlist rather than a denylist, so an
// unfamiliar type is never asked: we could not have tagged it in the first place.
const META_TYPES = new Set([
  'sticky_note',
  'card',
  'shape',
  'image',
  'text',
  'connector',
  'embed',
  'preview',
]);

function canHoldMeta(type: string): boolean {
  return META_TYPES.has(type);
}

// What this item's `sync()` costs. Updating an image is Level 3 — the same 500
// credits as creating one — while every other sync is Level 1 (see ./weights).
//
// Worth the branch rather than a flat price: screens and automations are images,
// so the passes that reflow specs and re-dock slice buttons move images by the
// handful, and pricing those at 50 under-counted the unattended work tenfold.
function syncOpFor(item: { type: string } | undefined): MiroOp {
  return item?.type === 'image' ? 'syncImage' : 'sync';
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

  // Ensures every id is in the cache, fetching the missing ones. A fetch failure
  // propagates: swallowing it left the cache empty and every read below silently
  // behaving as though the element simply had nothing to say.
  //
  // An id that no longer exists is not a failure — `board.get` omits it and the
  // caller sees it missing from the cache, which is what the housekeeping passes
  // already rely on to detect deletions.
  private async ensureLive(ids: string[]): Promise<void> {
    const missing = ids.filter((id) => !this.items.has(id));
    if (missing.length === 0) return;
    this.cacheAll(await withRateLimit('get', () => miro.board.get({ id: missing })));
  }

  // Whether an error is board.getById's answer for an id that no longer exists
  // — the documented wording is "Can not retrieve item with id …". That is the
  // one named condition under which a fresh fetch may report absence as a
  // value; anything else (rate limit, bridge down) propagates, because a host
  // that couldn't look is not a host that answered "gone".
  private static isNotFound(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return message.includes('can not retrieve item') || message.includes('not found');
  }

  // Fetches one item FRESH from the board — never served from the cache, whose
  // handles are fetch-time snapshots that go stale as the board is edited — and
  // re-caches the live handle. null means the board answered that the id no
  // longer exists, in which case any stale cache entry is evicted with it:
  // ensureLive treats "in the cache" as "exists", and a corpse it keeps
  // vouching for only surfaces later as a failed sync.
  private async fetchLiveById(id: string): Promise<LiveItem | null> {
    try {
      return this.cache(
        (await withRateLimit('getById', () => miro.board.getById(id))) as LiveItem,
      );
    } catch (error) {
      if (!MiroCanvas.isNotFound(error)) throw error;
      this.items.delete(id);
      return null;
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
      await withRateLimit('create', () =>
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
      await withRateLimit('createImage', () =>
        miro.board.createImage({ url: spec.url, x: spec.x, y: spec.y, width: spec.width }),
      ),
    );
    return this.snap(image);
  }

  async createText(spec: TextSpec): Promise<CanvasElement> {
    type Arg = Parameters<typeof miro.board.createText>[0];
    const text = this.cache(
      await withRateLimit('create', () =>
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
      await withRateLimit('create', () =>
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
      await withRateLimit('create', () =>
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
    await withRateLimit('create', () =>
      miro.board.createConnector({ start: { item: fromId }, end: { item: toId } }),
    );
  }

  async createArrow(spec: ArrowSpec): Promise<CanvasElement> {
    type Arg = Parameters<typeof miro.board.createConnector>[0];
    // Free-position endpoints (no item), a straight line, default stroke caps
    // (so the head matches Miro's default linking arrow) — only color, width and
    // an optional on-line caption are overridden.
    const connector = this.cache(
      await withRateLimit('create', () =>
        miro.board.createConnector({
          shape: 'straight',
          start: { position: { x: spec.start.x, y: spec.start.y } },
          end: { position: { x: spec.end.x, y: spec.end.y } },
          style: {
            ...(spec.color !== undefined ? { strokeColor: spec.color } : {}),
            ...(spec.thickness !== undefined ? { strokeWidth: spec.thickness } : {}),
            ...(spec.textColor !== undefined ? { color: spec.textColor } : {}),
            ...(spec.fontSize !== undefined ? { fontSize: spec.fontSize } : {}),
          },
          ...(spec.text !== undefined
            ? { captions: [{ content: spec.text, position: 0.5, textAlignVertical: 'top' }] }
            : {}),
        } as Arg),
      ),
    );
    return this.snap(connector);
  }

  async get(ids: string[]): Promise<CanvasElement[]> {
    if (ids.length === 0) return [];
    const items = this.cacheAll(await withRateLimit('get', () => miro.board.get({ id: ids })));
    return items.map((item) => this.snap(item));
  }

  async containers(): Promise<CanvasElement[]> {
    const frames = this.cacheAll(await withRateLimit('get', () => miro.board.get({ type: 'frame' })));
    return frames.map((frame) => this.snap(frame));
  }

  async childrenOf(containerId: string): Promise<CanvasElement[]> {
    await this.ensureLive([containerId]);
    const frame = this.items.get(containerId) as unknown as
      | { getChildren?: () => Promise<LiveItem[]> }
      | undefined;
    if (!frame?.getChildren) return [];
    const children = this.cacheAll(await withRateLimit('getChildren', () => frame.getChildren!()));
    return children.map((child) => this.snap(child));
  }

  private snapConnector(item: LiveItem): CanvasConnector {
    const c = item as unknown as {
      id: string;
      start?: { item?: string };
      end?: { item?: string };
      style?: { strokeColor?: string };
      captions?: { content?: string }[];
    };
    const caption = c.captions?.[0]?.content;
    return {
      id: c.id,
      start: c.start?.item ?? null,
      end: c.end?.item ?? null,
      color: typeof c.style?.strokeColor === 'string' ? c.style.strokeColor : null,
      caption: typeof caption === 'string' ? caption : null,
    };
  }

  async connectors(): Promise<CanvasConnector[]> {
    const items = this.cacheAll(await withRateLimit('get', () => miro.board.get({ type: 'connector' })));
    return items.map((item) => this.snapConnector(item));
  }

  // One connector, fetched fresh (getById, Level 1 — not the board-wide Level 3
  // sweep `connectors` makes). null is the board's answer: no such connector —
  // deleted, or the id belongs to an item of another type.
  async connectorById(id: string): Promise<CanvasConnector | null> {
    const item = await this.fetchLiveById(id);
    if (!item || item.type !== 'connector') return null;
    return this.snapConnector(item);
  }

  async getFresh(ids: string[]): Promise<CanvasElement[]> {
    const items = await Promise.all(ids.map((id) => this.fetchLiveById(id)));
    return items
      .filter((item): item is LiveItem => item !== null)
      .map((item) => this.snap(item));
  }

  async groups(): Promise<CanvasGroup[]> {
    const groups = await withRateLimit('get', () => miro.board.get({ type: 'group' }));
    return groups.map((group) => {
      const g = group as unknown as { id: string; itemsIds?: string[] };
      return { id: g.id, members: Array.isArray(g.itemsIds) ? g.itemsIds : [] };
    });
  }

  async selection(): Promise<CanvasElement[]> {
    const items = this.cacheAll(await withRateLimit('getSelection', () => miro.board.getSelection()));
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
      if (patch.fontSize !== undefined && w.style) w.style.fontSize = patch.fontSize;
      if (patch.textAlign !== undefined && w.style) w.style.textAlign = patch.textAlign;
      if (patch.textAlignVertical !== undefined && w.style)
        w.style.textAlignVertical = patch.textAlignVertical;
      syncs.push(withRateLimit(syncOpFor(item), () => w.sync()));
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
    // A failure propagates. This used to be swallowed on the grounds that "the
    // child keeps the absolute position it was created at, so the layout is
    // still right" — true only of a benign refusal, and false of the failure
    // that actually happens: a rate-limited add leaves the child unparented
    // while the coords it is then given are meant to be frame-relative.
    await withRateLimit('structural', () => frame.add!(child));
    const w = child as unknown as WriteView;
    w.x = relX;
    w.y = relY;
    await withRateLimit(syncOpFor(child), () => w.sync());
  }

  async group(ids: string[]): Promise<void> {
    // Miro rejects grouping items that already belong to a group, so dissolve
    // any group these items are in first — that is how a fields box joins a
    // screen's existing title+image group (the caller passes the full member
    // set). Re-fetch fresh handles afterwards: the ungroup invalidates the
    // cached ones, and grouping stale handles silently no-ops.
    await this.dissolveGroupsOf(ids);
    const items = this.cacheAll(await withRateLimit('get', () => miro.board.get({ id: ids })));
    if (items.length < 2) return;
    // Grouping is not cosmetic, so its failure is not ignorable: a screen's
    // fields box is found through its group members, and the completeness check
    // resolves connector endpoints to a group's image. A silently ungrouped
    // screen loses its fields and drops out of the check.
    await withRateLimit('structural', () =>
      miro.board.group({
        items: items as unknown as Parameters<typeof miro.board.group>[0]['items'],
      }),
    );
  }

  // Ungroups any group that contains one of the given ids, freeing its members
  // so they can be regrouped. A failure propagates: the regroup that follows
  // would only fail too (Miro rejects grouping items already in a group), and it
  // is better to say which step actually broke.
  private async dissolveGroupsOf(ids: string[]): Promise<void> {
    const wanted = new Set(ids);
    const groups = await withRateLimit('get', () => miro.board.get({ type: 'group' }));
    for (const group of groups) {
      const g = group as unknown as { itemsIds?: string[]; ungroup?: () => Promise<unknown> };
      if (g.ungroup && Array.isArray(g.itemsIds) && g.itemsIds.some((m) => wanted.has(m))) {
        await withRateLimit('structural', () => g.ungroup!());
      }
    }
  }

  // [id] means the board answered and this element is in no group. A failed read
  // propagates rather than reporting the same thing: "in no group" is how a
  // screen loses its fields box (findFieldsBox scans the group members), so a
  // fabricated one silently empties an element's fields.
  async groupMembers(id: string): Promise<string[]> {
    // Query the live group list rather than the item's cached `groupId` — the
    // cached handle can predate the grouping (it was created ungrouped), so its
    // groupId reads stale. The group's own `itemsIds` is always current.
    const groups = await withRateLimit('get', () => miro.board.get({ type: 'group' }));
    for (const group of groups) {
      const itemsIds = (group as unknown as { itemsIds?: string[] }).itemsIds;
      if (Array.isArray(itemsIds) && itemsIds.includes(id)) return itemsIds;
    }
    return [id];
  }

  // An element that is already gone is not a failure — ensureLive leaves it out
  // of the cache and there is nothing to remove. A failed removal propagates:
  // the cleanup passes prune their registry record on the assumption the element
  // went with it, so a swallowed failure orphans the element permanently.
  async remove(id: string): Promise<void> {
    await this.ensureLive([id]);
    const item = this.items.get(id);
    if (!item) return;
    await withRateLimit('structural', () => miro.board.remove(item));
    this.items.delete(id);
  }

  async setConnectorColor(id: string, color: string): Promise<void> {
    await this.ensureLive([id]);
    const connector = this.items.get(id) as unknown as
      | { style?: { strokeColor?: string }; sync?: () => Promise<unknown> }
      | undefined;
    if (!connector?.style || !connector.sync) return;
    connector.style.strokeColor = color;
    await withRateLimit('sync', () => connector.sync!());
  }

  async setConnectorCaption(id: string, text: string | null): Promise<void> {
    await this.ensureLive([id]);
    const connector = this.items.get(id) as unknown as
      | { captions?: unknown; sync?: () => Promise<unknown> }
      | undefined;
    if (!connector?.sync) return;
    // The whole array is replaced, so any hand-written caption is overwritten —
    // deliberate (see the Canvas port). An empty array clears the line.
    connector.captions = text
      ? [{ content: text, position: 0.5, textAlignVertical: 'top' }]
      : [];
    await withRateLimit('sync', () => connector.sync!());
  }

  // Deliberately NOT guarded by canHoldMeta, unlike getMeta below. "This element
  // carries no tag" is a true answer for something that can't hold one; "I
  // tagged it" is not. Tagging a frame is a bug in the caller (that's why the
  // em-* registries exist), and it should say so rather than quietly no-op.
  async setMeta(id: string, meta: ElementMeta): Promise<void> {
    await this.ensureLive([id]);
    const item = this.items.get(id) as unknown as
      | { setMetadata?: (key: string, value: unknown) => Promise<unknown> }
      | undefined;
    if (!item?.setMetadata) return;
    await withRateLimit('meta', () => item.setMetadata!(META_KEY, meta));
  }

  // null means the board answered and this element carries no tag of ours —
  // including when the element no longer exists, which `ensureLive` reports by
  // leaving it out of the cache. A failure to *ask* propagates instead: this
  // returning null on a rate-limited read is what made every typed block look
  // untyped, and the Fields tab render "nothing selected" for an hour.
  async getMeta(id: string): Promise<ElementMeta | null> {
    await this.ensureLive([id]);
    const item = this.items.get(id);
    if (!item) return null;
    // An element that cannot hold metadata carries no tag of ours because it
    // *can't* — a fact about the board, not a failure, so it is answered without
    // asking. Miro rejects the call outright on those types ("The specified
    // command is unsupported: Frame.getMetadata()") rather than returning
    // nothing, and the published types declare the method anyway, so neither a
    // `typeof` check nor the type-checker catches it. This is the named
    // condition that lets us carry on; without it, selecting a slice threw.
    if (!canHoldMeta(item.type)) return null;
    const view = item as unknown as { getMetadata?: (key: string) => Promise<unknown> };
    if (!view.getMetadata) return null;
    return (
      ((await withRateLimit('meta', () => view.getMetadata!(META_KEY))) as ElementMeta | undefined) ??
      null
    );
  }

  // Items created over a frame can get captured by it, their coordinates ending
  // up parent-relative while we supplied absolute — re-pin them. "Not captured"
  // is the normal case and returns quietly; a failed read or write propagates,
  // because an unsettled element sits at visibly the wrong place on the board.
  async settle(id: string, absX: number, absY: number): Promise<void> {
    const [fresh] = await withRateLimit('get', () => miro.board.get({ id: [id] }));
    if (!fresh) return;
    this.cache(fresh);
    const view = fresh as unknown as ReadView;
    if (!('parentId' in view) || !view.parentId) return;
    const [parent] = await withRateLimit('get', () => miro.board.get({ id: [view.parentId!] }));
    if (!parent || parent.type !== 'frame') return;
    const p = parent as unknown as ReadView;
    const w = fresh as unknown as WriteView;
    w.x = absX - ((p.x ?? 0) - (p.width ?? 0) / 2);
    w.y = absY - ((p.y ?? 0) - (p.height ?? 0) / 2);
    await withRateLimit(syncOpFor(fresh), () => w.sync());
  }

  setBulkMode(on: boolean, signal?: AbortSignal): void {
    // The limiter drops the bulk pacing floor the instant the run aborts (via the
    // signal), so Pause is prompt even mid-write; the build still stops at its
    // next boundary.
    setBulkWrites(on, signal);
  }

  isUnderRateLimit(): boolean {
    return underRateLimit();
  }

  async deselect(): Promise<void> {
    await withRateLimit('structural', () => miro.board.deselect());
  }

  async deepLink(id: string): Promise<string | null> {
    const info = await withRateLimit('structural', () => miro.board.getInfo());
    return `https://miro.com/app/board/${info.id}/?moveToWidget=${id}`;
  }
}
