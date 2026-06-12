# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — typecheck (`tsc`, strict) + production build. This is the verification step after every change; there are no tests or linters.
- `npm start` / `npm run dev` — Vite dev server on port 3000 (the app's registered App URL).
- `npm run typecheck` — `tsc` only.

To see changes in Miro: the app must be registered once (README has the steps; App URL `http://localhost:3000`, scopes `boards:read` + `boards:write`). After panel changes, close and reopen the panel; after changes to `src/index.ts` or anything it pulls in (`board.ts`), the whole **board tab must be refreshed** — the headless page only reloads with it. One-time listener registrations are guarded by `window` flags and survive HMR. `Miro creds.txt` in the root holds credentials; never read, modify, or commit it.

## What this is

A Miro Web SDK v2 app for event modeling: a palette panel that places typed building blocks (sticky notes, screens, automations, slices), pattern stamps, swimlanes, and Given/When/Then specification frames with linked shallow copies.

Two entry pages, both declared as Vite build inputs:

- `index.html` → `src/index.ts` — the **headless board script**. Loaded invisibly for the whole board session. Owns everything that must work with the panel closed: the `icon:click` handler, the `selection:update` flow (on-board + buttons, fast frame-size watcher for spec reflow and slice-button re-dock), and the 4s `specHousekeeping` interval (copy sync, dead-spec/slice cleanup, fallback reflow/re-dock, button healing).
- `app.html` → `src/app.tsx` — the React 19 panel (Mirotone CSS from CDN). Owns only UI and the `drop` handler (drop targets are panel DOM elements).

## Code organization — everything is a component

**Rule (user-mandated): every new piece of functionality is its own module/component, with its styles in a co-located plain `.css` file imported by the component.** (Plain CSS, not CSS Modules — class names are global because of the dynamic `bg-<type>` classes and the Mirotone/`miro-draggable` interplay.) Never grow an existing file into a god-file; `board.ts` and the monolithic `style.css` once held everything and were deliberately split.

- `src/blocks.ts` — the event-modeling vocabulary (block types, labels, sticky colors).
- `src/miro/` — shared SDK plumbing: `helpers.ts` (types, predicates, viewport, settle, titles, error toast), `appData.ts` (registry persistence, `FrameRecord`), `icons.ts` (SVG icons shared across features).
- `src/features/` — one module per board feature: `stickies`, `automation`, `screens`, `slices`, `createBlock` (dispatcher), `connectors`, `patterns`, `swimlanes`.
- `src/features/specs/` — the specification feature, itself componentized: `model` (geometry, registries), `create`, `copies` (linked copies + sync), `reflow`, `selection` (+ buttons, size watcher), `housekeeping` (background tick composition).
- `src/panel/` — React components: `Panel` composes one component per panel section (`BuildingBlocksSection`, `ScreensSection`, `PatternsSection`, `SpecificationsSection`, `SwimlanesSection`), plus `Swatch`, `Dot`, `useBusyGuard` (shared busy/guard state), and `registerDropHandler`. Each component imports its own `.css`; `Panel.css` holds the shared section primitives (`.section`, `.footnote`, `.w-full`), and `src/style.css` keeps only design tokens and the `bg-*` vocabulary colors.

Import direction: panel → features → miro; the headless `index.ts` → features → miro. Features never import from `panel/`; `specs/selection.ts` and `specs/housekeeping.ts` are the only modules that reach across into `slices.ts` (the size watcher and background tick serve both).

## SDK landmines (learned the hard way)

- The CDN `miro.js` is a bootstrap; the real SDK is whatever Miro currently ships. Runtime validation can be **ahead of `@mirohq/websdk-types`**: `createFrame` requires `style.fillColor` at runtime (types say optional) and rejects unknown props. When the runtime contradicts the types, trust the runtime error toast (`reportError` surfaces the real message).
- **Frames**: no app metadata, no nesting, no connector endpoints, no border styling (only `fillColor`), and children can survive frame deletion. Hence: board-app-data registries (`em-specs`, `em-slices`, `em-links`) instead of frame metadata, and explicit orphan cleanup. The registries also track frame width/height so polling can detect resizes.
- **Shrinking a frame evicts or deletes children** that fall outside the new bounds. App-placed frame chrome must be self-healing: verify the child still exists and is still parented before repositioning it, re-adopt or recreate otherwise (see `redockSliceButton`).
- **No SDK events** for item update, delete, resize, or click. Everything reactive is built from `selection:update` (a click IS a selection), the `drop` event, and polling. Frame "buttons" are images with `em` metadata recognized on selection.
- Registering listeners inside React effects caused duplicate items: StrictMode double-mounts, HMR re-evaluates modules, and `ui.off` is unreliable. Pattern: register once per page load behind a `window.__em*Registered` flag, with a `window.__em*Handler` indirection so HMR keeps logic fresh.
- The `Unsupported` item type has `type: string`, so `item.type === 'frame'` narrowing fails on unions — use the existing type predicates (`isSpecFrameItem` etc.).
- Frame children use parent-top-left-relative coordinates. The convention everywhere: create at absolute coords, `frame.add(item)`, then re-set relative coords and `sync()`. Items created over a frame may get auto-captured with shifted coords — `settleAtAbsolute` re-pins them.
- Sticky `fillColor` is a fixed palette; the four model colors (`orange`, `blue`, `light_green`, `yellow`, plus `red` for errors) are native values. Shape text does NOT scale on resize — scalable graphics are inline SVGs shipped as base64 data URLs (`createImage`).
- Every awaited SDK call is a round-trip (~tens of ms). Batch independent creations with `Promise.all` (spec creation does this); sequential chains of 20+ calls feel slow to the user.

## Product decisions (do not regress)

These came from explicit user feedback; details in the auto-memory file `miro-event-modeler-ux-prefs.md`:

- Never auto-zoom on creation. `ensureVisible` only expands the viewport, never zooms in.
- Connectors use SDK defaults — zero shape/style overrides. No arrow-styling features.
- Linking items is manual (Miro's own connector tool); a chain-mode feature was built and removed. Pattern stamps may pre-link their own items.
- Lean panel: no app-name header, no close button, no redundant controls. On-board affordances (the + buttons) are preferred over panel buttons for board-targeted actions.
- Screens and automations are grouped title-text + image pairs — not frames (connectors), not shapes (text scaling, accidental text-edit). Slices and specs are frames (containment is the point).
- Don't decorate frames with child shapes (a slice border attempt hid the frame title).
