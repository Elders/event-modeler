# Figma import: draft a model from a Figma file

Generate a whole event model from a Figma design, entirely client-side. This is
a sibling of the text generator (the Generate tab): a Figma file is a new
*input* that produces the same `ModelPlan` the AI generator already builds, so
everything downstream — layout, blocks, links, specs, checkpoint/resume — is
reused unchanged. The only genuinely new code is the Figma adapter.

This doc is the design of record; [CLAUDE.md](../CLAUDE.md) summarizes the
architecture rules it follows, and [DECISIONS.md](DECISIONS.md) carries the
rationale for the choices that had real alternatives.

## Why it fits with almost no new machinery

The Planner port's `plan` already turns text into a `ModelPlan`. The Figma path
calls that same planner — with the user's same Anthropic key — assembling the
request in two halves: the shared, user-editable system preamble (the modeling
vocabulary + output contract) **plus a `FIGMA_ADDENDUM`** appended to the system
prompt (how to read screens+flow), with `describeDesign` supplying the data
(screens + flow) in the user message. So:

- **no separate system prompt and no JSON-schema change** — just one optional
  `systemSuffix` on `plan` (the text path passes nothing), **no second AI integration;**
- screens end up showing the *real Figma mockups*, because the app already
  models a screen as an image and Miro fetches an image URL server-side;
- the build is the existing `buildModel`, so interrupt/resume and the on-board
  resume banner work for a Figma import for free.

## Why it needs no backend

Confirmed empirically against a real file: `api.figma.com` sends
`access-control-allow-origin: *`, so the browser calls it **directly**,
cross-origin, from the panel — no proxy, no accounts/billing backend. The Figma
personal access token lives in `localStorage`, exactly like the Anthropic key.
`adapters/figma/source` targets `api.figma.com` directly; a `proxyUrl` setting is
the only override, for a user whose own network genuinely blocks the host (their
own tiny stateless shim). Production (a static host) uses the same direct path
and works.

**A dead end worth recording (don't re-add it):** a Vite dev proxy at `/figma`
was tried first, on the theory that a browser ad blocker was intercepting the
third-party request and returning a blank `HTTP 200`. It was the wrong theory —
the response headers proved Figma was reachable and CORS-open all along. Worse,
routing Figma's large, chunked, `Connection: close` file responses **through**
the Vite proxy corrupted them: the headers arrived, the body did not (surfacing
as "empty response"). Going direct fixed it. The `/figma` proxy remains in
[vite.config.ts](../vite.config.ts) only as an opt-in target for `proxyUrl`, not
a default — never route large file responses through it automatically.

The token needs one scope: **`file_content:read`** (reads the file tree *and*
renders frames). Nothing is ever written to Figma, so no write scope is granted.

## Data flow

```
Figma file URL
  → adapters/figma        GET /v1/files/:key           (one read: frames, text, prototype flow)
                          GET /v1/images/:key          (frame → temporary PNG render URLs)
                          [result cached per file key for 5 min — retries don't re-spend]
  → domain/designDoc      normalizeDesignDoc()  (trust boundary, like normalizePlan)
  → features/importFigma  describeDesign()      → structured prompt text
  → services().planner.plan(text)               ← existing Anthropic planner + key, unchanged
  → ModelPlan  + bind each screen block's imageUrl by ref
  → features/generate buildFromPlan()           ← existing build path (checkpoint + resume)
  → board (screens show the real Figma mockups)
```

## The mapping (product logic)

| Figma | Event-model element |
| --- | --- |
| Top-level frame | **Screen** block, rendered from its real PNG |
| Prototype transition (button → frame) | a user action → **Command** → **Event** → **Read model** the next screen displays |
| Button / CTA text | the command/event name the AI infers |
| Text labels & form fields in a frame | **fields** on the command/event |
| Frame with no incoming edge | flow entry point |
| List/dashboard frame (reads, doesn't submit) | **read model / view** |
| Figma page | candidate **slice** grouping |
| Success/confirmation screen | hint for an **automation** (low confidence) |

The AI owns the *structure* (which commands/events/read-models exist, how they
link, what fields they carry). The extraction owns the *grounding* (the real
frames and the real click-through graph) so the AI is drafting over facts rather
than inventing a flow.

## New modules (by layer, dependency order)

### `src/domain/designDoc.ts` — pure, zero platform deps

Mirrors `domain/plan.ts`.

- Types: `DesignDoc` (`frames: DesignFrame[]`, `edges: FlowEdge[]`),
  `DesignFrame` (`ref`, `name`, `labels: string[]`, `renderUrl: string | null`),
  `FlowEdge` (`from` ref, `to` ref, `trigger` label).
- `normalizeDesignDoc(raw): DesignDoc` — the trust boundary. Keeps only
  well-formed frames with unique refs, and edges whose endpoints are known
  frames (drops dangling edges exactly as `normalizePlan` drops links to unknown
  blocks). A `renderUrl` is kept only when it is an `https://` URL.
- `parseFigmaFileKey(url): string | null` — pull the key from
  `figma.com/design/:key/…`, `/file/:key/…`, or `/proto/:key/…`.
- `looksLikeScreenFlow(doc): boolean` — the component-library guard: a doc with
  frames but no flow edges and generic component-ish names is probably not a
  screen flow.
- `FIGMA_ADDENDUM` — the system-prompt suffix for an import: how to read the
  screens+flow input (reuse each screen's ref, map a click to command→event→read
  model, infer fields from labels). Appended to the shared preamble, so the
  user's edits still apply and there's no second prompt to keep in sync.
- `describeDesign(doc): string` — the **data** half: each frame listed **with its
  ref**, its labels, and the flow edges, in the user message. The instructions
  for reading it live in `FIGMA_ADDENDUM`, not here. Pure string over domain types.

### `src/ports/designSource.ts`

The abstraction the use-case speaks to; owns its own config like `Planner` does.

```ts
export interface DesignSourceSettings {
  token: string;
  proxyUrl?: string; // reserved; unused/empty in Phase 1
}

export interface DesignSource {
  // File tree + render URLs, resolved to a DesignDoc. Throws a user-facing
  // message on a refusal (bad token/scope, missing file); throws
  // HostUnavailableError when Figma can't be reached at all.
  fetchDesign(fileKey: string, signal?: AbortSignal): Promise<DesignDoc>;
  // Config, both THROW if the store can't be read/written — a swallowed read
  // would claim "no token" when the truth is "couldn't look" (the codebase's
  // #1 rule). An empty token is a real answer: the user hasn't set one.
  getSettings(): DesignSourceSettings;
  setSettings(settings: DesignSourceSettings): void;
}
```

### `src/adapters/figma/` — the ONLY place the Figma API appears

Mirrors `adapters/anthropic/`.

- `client.ts` — the two `fetch`es with the `X-Figma-Token` header (direct;
  `proxyUrl` prepends a base if set): the file and `/images`. **Propagates, never
  catches to fabricate:** a `403` → "Figma rejected the token — check the
  file_content:read scope"; a `404` → "file not found or not shared with this
  token"; a `429` → the wait from `Retry-After` (`rateLimitMessage`); an
  empty/unreadable 2xx body → its own worded error (never a bare
  `response.json()` throw); a network reject → thrown as `HostUnavailableError`
  so a caller can tell "couldn't reach Figma" from "Figma said no".
- `extract.ts` — walk the file for the top-level screen frames, their labels, and
  the prototype flow (`extractDesign`, core in `buildExtract`).
- `source.ts` — orchestrates file → images → `normalizeDesignDoc`, with a
  5-minute per-file-key cache so a retry or re-import doesn't re-spend Figma's
  (count-based) file budget.
- `settings.ts` — `localStorage`-backed token (key `em.figma`), copied from
  `anthropic/settings.ts` including its no-fabrication discipline: never
  configured returns `{ token: '' }`; unreadable data throws.
- `errors.ts` — map a Figma HTTP failure to a message worth showing.
- `index.ts` — `createFigmaDesignSource(): DesignSource`.

### `src/features/importFigma.ts` — the use-case (ports only)

1. `parseFigmaFileKey(url)` → key (throw a clear message if it isn't a Figma
   file URL).
2. `services().designSource.fetchDesign(key, signal)` → `DesignDoc`.
3. Guard on `looksLikeScreenFlow` — if false, throw a helpful "this looks like a
   component library, not a screen flow" message (a *value*, not a swallowed
   error).
4. `describeDesign(doc)` → prompt text.
5. `requirePlanner().plan(promptText, signal)` → `ModelPlan`.
6. **Bind images:** for each screen block, match a `DesignFrame` by ref
   (primary) or `label === frame.name` (fallback) and set
   `block.imageUrl = frame.renderUrl`.
7. Hand the finished plan to `buildFromPlan(plan, signal)`.

## Changes to existing files (small, enumerated)

- **`domain/plan.ts`** — add `imageUrl?: string` to `PlannedBlock`;
  `normalizePlan` keeps it only when it's an `https://` URL (the plan is re-read
  from the checkpoint on resume, so validate on the way back in).
- **`features/screens.ts` + `createBlock.ts`** — screen creation takes an
  optional image URL; when present, `canvas.createImage({ url: renderUrl, … })`
  instead of the placeholder SVG. Miro fetches the URL server-side and stores it,
  so the temporary Figma S3 URL needs no browser CORS and becomes permanent at
  creation. `createBlock('screen', …)` forwards `block.imageUrl`.
- **`features/generate.ts`** — extract a shared `buildFromPlan(plan, signal)`
  that captures a checkpoint with `plan` already set and calls `runGeneration`.
  `generateModel(text)` keeps its plan-from-text path; `importFromFigma` calls
  `buildFromPlan`. Both converge on `buildModel`, so checkpoint/resume and the
  on-board banner work identically for a Figma import.
- **`services.ts`** — add `designSource?: DesignSource` (optional, panel-only,
  like `planner?`).
- **`app.tsx`** — add `designSource: createFigmaDesignSource()` to the panel's
  service bundle. The board script (`index.ts`) omits it, staying free of the
  Figma adapter and its code.
- **Generate tab** — a **source toggle at the top: Text | Figma** (chosen over a
  5th tab: both share one build engine and one resume banner). The Figma branch
  renders `panel/ImportFigmaSection.tsx` (+ co-located `.css`, per the
  every-feature-its-own-component rule): a file-URL input, a settings block for
  the Figma token (password field, read-only-scope helper), and an Import button.

## The hard part: prototype-transition extraction (`extract.ts`)

This is where the value is — Figma hands you the flow graph, so the AI isn't
guessing it. In the file JSON:

- Recurse the document → per page, collect top-level **frame** nodes → each
  becomes a `DesignFrame` (ref = node id; `name`; `labels` = every descendant
  text node's characters).
- Build a `nodeId → top-level frame ref` index in the same pass, so a transition
  landing on any node can be resolved to the frame that contains it.
- For any node carrying a prototype interaction, record a `FlowEdge`:
  - Modern shape: `node.interactions[].actions[]` where `action.type === 'NODE'`
    → `action.destinationId`, with `interaction.trigger.type` (e.g. `ON_CLICK`)
    and the node's own text/name as the trigger label.
  - Legacy shape: `node.transitionNodeID` → destination node id.
- Map each `destinationId` up to its containing top-level frame → an edge is
  frame → frame (a button inside frame A pointing at frame B).

Yields `Frame "Checkout" —[click "Place order"]→ Frame "Order confirmed"`, which
`describeDesign` turns into the prompt and the AI reads as *command → event →
read model the next screen displays*.

## Failures discipline (the codebase's #1 rule, applied)

- The adapter **propagates**: `403`/`404` (real answers) throw user-facing
  messages; a `fetch` rejection (network/CORS) throws `HostUnavailableError`.
  Never `catch`-and-return-`[]`.
- A frame with **no render URL** is a *value* — that screen falls back to the
  placeholder; it is not an error.
- The **component-library** verdict is a value the feature acts on, not a
  swallowed exception.
- One supervisor only — the existing generation guard around `buildModel` plays
  that role, unchanged.

## Phasing

- **Phase 1 (this doc):** structured extraction (frames + prototype flow + render
  URLs) → existing planner → build with real screen images. Fully client-side.
  Ships the feature.
- **Phase 2 (later, additive):** a vision fallback for files with **no wired
  prototype** (send frame PNGs to Claude — more of the user's own tokens, so cap
  the frame count); a proper form-input detector for richer field inference.
  Neither blocks Phase 1.

## Risks / edge cases

- **Two credentials.** Figma import needs *both* the Figma token and the
  Anthropic key (it reuses `planner.plan`). Gate the Import button on both being
  configured, and say so in the UI.
- **Render URLs expire.** Miro stores the image at creation, so *created*
  screens are permanent — but a build paused and resumed much later could meet an
  expired URL for a not-yet-created screen; those fall back to the placeholder
  (or a re-import). Not worth engineering around now; noted in code.
- **Token in `localStorage`** — same exposure as the Anthropic key already there;
  the read-only `file_content:read` scope keeps blast radius minimal.
- **Credits.** Figma REST calls don't touch Miro's budget (different host);
  planning spends the user's Anthropic tokens. Nothing new hits the Miro
  rate-limiter.
- **Screenshots (maintainer rule).** This adds a visible panel surface (the
  source toggle + Figma section), so the README set (`docs/images/`) and
  marketplace shots (`branding/screenshots/`) go stale — flag for re-capture.

## Verification

`npm run build` (tsc strict + build) is the gate — there are no tests or
linters. After wiring, refresh the board tab (the panel composition root
changed) and confirm a real file imports end-to-end.
