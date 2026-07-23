# Miro Event Modeler

A [Miro](https://miro.com) app for [event modeling](https://eventmodeling.org), built on the
**Web SDK v2** with **React + TypeScript**. The toolbar icon opens a panel split
into four tabs — **Build** (the manual modeling palette), **Properties** (the
per-selection name and field editor), **Generate** (AI), and **Console** (the
failure log and credit meter):

- **Generate from text** *(Generate tab)* — paste a description of a system or workflow and an AI
  agent (Claude) drafts a whole model: typed blocks laid out in the three lanes,
  connectors, grouped into slices, with Given/When/Then specifications. Enter
  your own Anthropic API key in the section's **Settings** (stored only in this
  browser's `localStorage`, never on the board) and pick a model. Everything it
  places is a normal, editable Miro widget — rearrange or delete as you like.
- **Building blocks** — drag (or click) to place: **Event** (orange sticky),
  **Command** (blue sticky), **Read model** (yellow-green sticky),
  **External event** (yellow sticky), **Automation** (a double-gear icon image
  with an editable, grouped title so automations can be named — not a sticky),
  **Screen** (a grouped pair: title text + image), and **Slice** (a titled Miro
  frame holding one atomic feature from vertical-slice architecture — items
  placed inside move with it; rename it via its title; the **+** button at its
  bottom edge adds a specification beneath it). Screens are deliberately not
  frames — connectors can't attach to frames, and screens must be linkable
  into flows. The palette also includes three tool tiles — **Specification**
  (a Given/When/Then frame, below), **Swimlane** (a single transparent lane
  guide; stack several for the conventional Screens / Commands & read models /
  Events rows), and **Chapter** (a thick horizontal arrow with an editable,
  grouped title above it, marking a phase of the timeline) — drag or click them
  like any block. To paste a screenshot onto a sketch screen, click the board
  first
  (so the canvas has focus), then Ctrl+V.
- **Pattern stamps** — one-click pre-linked slices for the four event-modeling
  patterns: command, view, automation, translation. Further linking is done
  manually with Miro's own connector tool.
- **Specification** *(Build tab tile)* — a Given/When/Then frame (labels only, so dragging
  anywhere moves the whole spec). Select a slice first and the spec stacks
  beneath it — below any specs already there — titled after the slice;
  otherwise it is standalone. Each zone has a **+** button on the board: click
  it, then select stickies on the model — linked shallow copies are placed in
  that zone, which grows (together with the frame) as copies are added, and
  editing the original updates its copies (one-way, polled every few seconds
  by the app's invisible board script, so it keeps working while the panel is
  closed; links live in board app data). Each copy carries
  Miro's native item link back to its original — the link badge marks it as a
  copy, and clicking it jumps to the source. The red **Error** sticky
  expresses a failing Then. Resizing a spec re-grids its copies to the new
  width automatically (detected by the same poll, once the width settles).
- **Properties** *(Properties tab)* — select a block, frame, or connector to
  rename it in place, and give data-bearing blocks named, typed **fields**
  (rendered in a sticky's own text, or an attached box beneath a screen or
  automation). A background completeness check reddens every arrow into a block
  whose incoming blocks don't supply all its required fields, captioning the
  shortfall. Select a single attached connector and the tab becomes the **arrow
  toolset** — copy or replace fields across the link, or jump to either end.
- **Console** *(Console tab)* — a running log of any failure the app hit (it
  keeps recording while the panel is closed), alongside a meter of the Miro API
  credits this app has spent over the last minute and hour.

Everything the app creates is a native Miro widget (sticky notes use Miro's own
color palette) tagged with app metadata (`em: { type }`) for future tooling.

## How a Miro app works

A Miro app is a small web app that Miro loads inside a board:

| File              | Role                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `index.html`      | The **App URL**. Loads on the board (invisibly) and registers the toolbar icon.                          |
| `app.html`        | Hosts the **React panel** — React mounts into its `#root` element.                                       |
| `src/index.ts`    | Headless board-script composition root: wires the Miro adapters, the icon-click and selection flows, and the background housekeeping passes. |
| `src/app.tsx`     | Panel composition root: wires the adapters (incl. the Anthropic planner) and mounts the React panel.     |
| `src/domain/*`    | Pure, platform-free event-modeling logic (vocabulary, fields, specs, completeness, the generator plan, …) — never touches `miro`. |
| `src/ports/*`     | The interfaces the use-cases speak to (`Canvas`, store, notifier, viewport, planner, …).                 |
| `src/services.ts` | The service locator — the one seam where a feature obtains its ports.                                     |
| `src/features/*`  | The use-cases, one module per feature (stickies, screens, slices, specs, fields, generate, …) — talk only to ports. |
| `src/adapters/*`  | The only place platform SDKs appear: `miro/` (Web SDK), `anthropic/` (the AI planner, panel-only), `browser/` (diagnostics + credit meter). |
| `src/panel/*`     | React components: the four-tab `Panel` and its section components, each with co-located CSS.             |
| `vite.config.ts`  | React plugin, dev server on port 3000, both HTML pages as build inputs.                                  |
| `tsconfig.json`   | TypeScript config (strict, `react-jsx`, Miro SDK global types).                                          |

The `src/` tree is a **hexagonal (ports-and-adapters)** architecture: the domain
and features never import `miro`, so the event-modeling logic can be lifted onto
another canvas by swapping the adapter set. The `miro` global itself is typed by
[`@mirohq/websdk-types`](https://www.npmjs.com/package/@mirohq/websdk-types),
wired in via the `types` field of `tsconfig.json` — no import needed.

## Prerequisites

- Node.js 20.19+ / 22.12+ / 24+ and npm (required by Vite 8)
- A Miro account with a **Developer team** (free — created automatically when you make your first app)

## 1. Install & run the dev server

```bash
npm install
npm run start
```

This serves the app at **http://localhost:3000**. Leave it running.

Other scripts: `npm run typecheck` (run `tsc`), `npm run build` (typecheck + production build), `npm run preview` (serve the build).

## 2. Register the app in Miro

1. Go to **https://miro.com/app/settings/user-profile/apps** (Profile settings → **Your apps**) and click **Create new app**.
2. Give it a name (e.g. `Event Modeler`), select your **Developer team**, and create it.
3. On the app settings page:
   - Under **App URL**, enter `http://localhost:3000` (Miro allows `http` for `localhost` during development).
   - Under **Permissions / Scopes**, enable **`boards:read`** and **`boards:write`**.
   - *(Optional)* upload an app icon.
4. Click **Install app and get OAuth token**, choose your Developer team, and confirm.

## 3. Use it on a board

1. Open (or create) a board in that Developer team.
2. In the left toolbar, open the **Apps** menu (the "+" / "More apps" icon) and select your app — its icon is added to the toolbar.
3. Click the icon → the panel opens → drag a building block onto the board. 🎉

## Build for production

```bash
npm run build     # typecheck, then output static files to dist/
npm run preview   # serve the production build locally
```

Deploy `dist/` to any static host (Vercel, Netlify, GitHub Pages, …) and update the
**App URL** in your Miro app settings to the deployed HTTPS URL.

## References

- [Build your first Hello World app](https://developers.miro.com/docs/build-your-first-hello-world-app)
- [Add icon click to your app](https://developers.miro.com/docs/add-icon-click-to-your-app)
- [Web SDK reference](https://developers.miro.com/docs/web-sdk-reference)
