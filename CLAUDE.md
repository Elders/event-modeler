# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — typecheck (`tsc`, strict) + production build. This is the verification step after every change; there are no tests or linters.
- `npm start` / `npm run dev` — Vite dev server on port 3000 (the app's registered App URL).
- `npm run typecheck` — `tsc` only.

Git: commit messages must NOT contain `Co-Authored-By` or any AI-attribution trailer (user rule).

To see changes in Miro: the app must be registered once (README has the steps; App URL `http://localhost:3000`, scopes `boards:read` + `boards:write`). After panel changes, close and reopen the panel; after changes to `src/index.ts` or anything it pulls in (the features/adapters it wires), the whole **board tab must be refreshed** — the headless page only reloads with it. One-time listener registrations are guarded by `window` flags and survive HMR. `Miro creds.txt` in the root holds credentials; never read, modify, or commit it.

## What this is

A Miro Web SDK v2 app for event modeling: a palette panel that places typed building blocks (sticky notes, screens, automations, slices), pattern stamps, swimlanes, and Given/When/Then specification frames with linked shallow copies. It also has an AI generator that drafts a whole model from pasted prose (Claude, via the user's own API key).

Two entry pages, both declared as Vite build inputs:

- `index.html` → `src/index.ts` — the **headless board script**. Loaded invisibly for the whole board session. Owns everything that must work with the panel closed: the `icon:click` handler, the `selection:update` flow (on-board + buttons, fast frame-size watcher for spec reflow and slice-button re-dock), and the 4s `specHousekeeping` interval (copy sync, dead-spec/slice cleanup, fallback reflow/re-dock, button healing).
- `app.html` → `src/app.tsx` — the React 19 panel (Mirotone CSS from CDN). Owns only UI and the `drop` handler (drop targets are panel DOM elements).

## Code organization — ports & adapters, everything a component

The code is a **hexagonal (ports-and-adapters) architecture** so the
event-modeling logic can be lifted onto a non-Miro canvas: Miro is one
swappable adapter, never imported by domain or feature code. Layers, in
dependency order (each may import only from layers below it):

- `src/domain/` — **pure** event-modeling logic, zero platform deps. `vocabulary` (block types, colors, labels), `spec` (zone geometry + layout math), `slice` (slice geometry), `viewport` (expand-never-zoom math), `records` (registry/link types + `normalizeRecords`), `meta` (element tag union). This is the portable core.
- `src/ports/` — the abstractions the use-cases speak to: `canvas` (the `Canvas` interface + the `CanvasElement` snapshot model and `ElementPatch`), `store`, `notifier`, `viewport`, `runtime`, `planner` (text → `ModelPlan`, plus its own API-key/model config). Ports import only domain types.
- `src/services.ts` — the service locator: `configureServices()` (called once per page at startup) + `services()`. The single seam where use-cases obtain ports; the domain never touches it.
- `src/features/` — the **use-cases** (one module per feature: `stickies`, `automation`, `screens`, `slices`, `createBlock`, `connectors`, `patterns`, `swimlanes`, `registerDrop`, `generate` (build a whole model from a `ModelPlan`), `plannerSettings`, plus `helpers`/`assets`), and `src/features/specs/` (`model` = domain re-export + store-backed reads, `create`, `copies`, `reflow`, `selection`, `housekeeping`). Features read ports via `services()`; they never reference `miro` or `adapters/`.
- `src/adapters/miro/` — the **only** place the `miro` global appears. `MiroCanvas` (keeps a live-handle cache so a batched `apply` is one round-trip per item), `MiroStore`, `MiroNotifier`, `MiroViewport`, `MiroRuntime`, `meta` (`META_KEY`); `index.ts` exports `createMiroServices()`.
- `src/adapters/anthropic/` — the **only** place the `@anthropic-ai/sdk` appears. `AnthropicPlanner` (calls Claude with a JSON-Schema-constrained structured output, then `normalizePlan`s it), the model catalog, the system prompt + schema, and `localStorage`-backed settings (the API key is per-browser, never board app data); `index.ts` exports `createAnthropicPlanner()`. Only the panel page wires it.
- `src/panel/` — React components (`Panel` + one component per section, `Swatch`, `Dot`, `useBusyGuard`), each with co-located plain CSS. Panel calls features, never ports/adapters directly.
- `src/index.ts` / `src/app.tsx` — composition roots: build `createMiroServices()`, `configureServices()`, then wire runtime events / mount the panel. `app.tsx` also adds `createAnthropicPlanner()` to the bundle (`Services.planner` is optional and panel-only, so the board script stays free of the AI SDK). Swapping the adapter set here is all it takes to host the tool elsewhere.

**Rule (user-mandated): every new piece of functionality is its own module/component, with its styles in a co-located plain `.css` file imported by the component.** (Plain CSS, not CSS Modules — class names are global because of the dynamic `bg-<type>` classes and the Mirotone/`miro-draggable` interplay.) Never grow an existing file into a god-file. `Panel.css` holds the shared section primitives (`.section`, `.footnote`, `.w-full`); `src/style.css` keeps only design tokens and the `bg-*` vocabulary colors.

**To extend:** put platform-free logic in `domain/`, the workflow in `features/` (talking only to ports), and any new SDK capability behind a port method implemented in `adapters/miro/`. Never call `miro.*` outside the adapter.

**The Canvas contract:** queries return immutable `CanvasElement` snapshots; mutations are a batch of `ElementPatch`es via `apply()` plus structural ops (`addToContainer`, `group`, `remove`, `setMeta`/`getMeta`, `settle`). Coordinates are **local**: relative to the parent container if parented, absolute otherwise — the Miro adapter maps this 1:1 to the SDK's child-relative coords, and `addToContainer`/`settle` are the only bridges between the two spaces.

## SDK landmines (learned the hard way)

- The CDN `miro.js` is a bootstrap; the real SDK is whatever Miro currently ships. Runtime validation can be **ahead of `@mirohq/websdk-types`**: `createFrame` requires `style.fillColor` at runtime (types say optional) and rejects unknown props. When the runtime contradicts the types, trust the runtime error toast (`reportError` surfaces the real message).
- **Frames**: no app metadata, no nesting, no connector endpoints, no border styling (only `fillColor`), and children can survive frame deletion. Hence: board-app-data registries (`em-specs`, `em-slices`, `em-links`) instead of frame metadata, and explicit orphan cleanup. The registries also track frame width/height so polling can detect resizes.
- **Shrinking a frame evicts or deletes children** that fall outside the new bounds. App-placed frame chrome must be self-healing: verify the child still exists and is still parented before repositioning it, re-adopt or recreate otherwise (see `redockSliceButton`).
- **No SDK events** for item update, delete, resize, or click. Everything reactive is built from `selection:update` (a click IS a selection), the `drop` event, and polling — all surfaced through the `Runtime` port. Frame "buttons" are images with `em` metadata recognized on selection (`canvas.getMeta`).
- Registering listeners inside React effects caused duplicate items: StrictMode double-mounts, HMR re-evaluates modules, and `ui.off` is unreliable. Pattern (now in `MiroRuntime`): register once per page load behind a `window.__em*Registered` flag, with a `window.__em*Handler` indirection so HMR keeps logic fresh.
- The `Unsupported` item type has `type: string`, so `item.type === 'frame'` narrowing fails on unions. The adapter normalizes every item's `type` to a `CanvasElement.kind`; use-cases narrow on `kind` (`'container'`, `'card'`, `'image'`, …), never on raw SDK types.
- Frame children use parent-top-left-relative coordinates. The adapter's convention: create at absolute coords, then `addToContainer` re-sets relative coords and `sync()`s. Items created over a frame may get auto-captured with shifted coords — `MiroCanvas.settle` (the `canvas.settle` port op) re-pins them; a non-capturing canvas no-ops it.
- Sticky `fillColor` is a fixed palette; the four model colors (`orange`, `blue`, `light_green`, `yellow`, plus `red` for errors) are native values. Shape text does NOT scale on resize — scalable graphics are inline SVGs shipped as base64 data URLs (`createImage`).
- Every awaited SDK call is a round-trip (~tens of ms). Batch independent creations with `Promise.all` (spec creation does this); sequential chains of 20+ calls feel slow to the user. **But** Miro rate-limits writes (HTTP 429): a single user action is fine, but a *bulk* op that bursts dozens of creates trips it. So `MiroCanvas` wraps every write (creates, `sync`, `add`, `setMetadata`) in `withRetry` backoff, and bulk callers like `generate` create **sequentially** instead of `Promise.all`. Per-action features keep using `Promise.all`.

## Product decisions (do not regress)

These came from explicit user feedback; details in the auto-memory file `miro-event-modeler-ux-prefs.md`:

- Never auto-zoom on creation. `ensureVisible` only expands the viewport, never zooms in.
- Connectors use SDK defaults — zero shape/style overrides. No arrow-styling features.
- Linking items is manual (Miro's own connector tool); a chain-mode feature was built and removed. Pattern stamps may pre-link their own items.
- Lean panel: no app-name header, no close button, no redundant controls. On-board affordances (the + buttons) are preferred over panel buttons for board-targeted actions.
- Screens and automations are grouped title-text + image pairs — not frames (connectors), not shapes (text scaling, accidental text-edit). Slices and specs are frames (containment is the point).
- Don't decorate frames with child shapes (a slice border attempt hid the frame title).
