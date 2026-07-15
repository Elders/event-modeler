# Decisions & learned constraints

Durable product decisions and platform lessons behind this app, collected from
explicit maintainer feedback and debugging sessions. [CLAUDE.md](../CLAUDE.md)
summarizes the rules; this file carries the fuller context — what was tried,
rejected, and why — so no agent or contributor re-litigates them. **Do not
regress any of these without asking the maintainer first.**

## UX decisions (June 2026)

- **Never auto-zoom** when the app creates items. Only expand the viewport if
  new items fall outside it — never zoom in. The user tests on a real board and
  viewport jumps were the first thing rejected.
- **Linking is manual**, with Miro's own connector tool. An in-app Connect
  feature (chain mode, "link selected") was built and removed at the user's
  request — don't re-add it unprompted. Pattern stamps may still pre-link their
  own items.
- **Arrows use plain SDK defaults** — zero shape/style overrides. A "match
  arrows to selection" style-capture feature was built and removed (2026-06-11).
  Don't propose arrow-styling features; the user restyles arrows manually. The
  single exception is the completeness check recoloring under-supplied arrows.
- **Lean panel**: no app-name header, no close button (redundant with Miro's
  chrome), no controls that duplicate on-board affordances.
- **Screens/automations are two grouped objects** — title text + image. Frames
  were tried (connectors can't attach to them) and shapes were tried (text
  doesn't scale, accidental text-edit); both rejected.
- **Slices are plain Miro frames** (title "Slice", transparent fill). A
  transparent child-shape border decoration was tried and reverted — it hid the
  frame title. Don't decorate frames with child shapes; the only safe frame
  styling lever is `fillColor`.
- The general principle: prefer native-feeling, minimal tooling. Place native
  widgets and leave manipulation (linking, arranging) to Miro's own tools.

## Chapters

Chapters group slices into logical contexts so the big picture of an Event
Model reads at a glance. Each chapter is **one blue connector** (color
`#61DEFF`) with its name as the caption **above the line**, placed **directly
above** the model so the eye catches the current context while scanning the
timeline. A chapter may optionally be subdivided by a second layer of narrower
sub-chapter arrows beneath it — like chapters and sub-chapters in a book — but
sub-chapters are optional and many chapters stand alone. Reference example: a
"Shopping" chapter with four sub-chapters "Items", "Inventory", "Price Change",
"Submission". If extending the feature, preserve: blue arrows, caption above
the line, placement above the model, no enforced layering.

## AI generator (the Generate tab)

Decisions the user made explicitly (2026-06-15), each chosen over an
alternative that was offered:

- **The API key lives in the browser** (`localStorage`, key `em.planner`),
  entered in the section's Settings. NOT an env var, NOT a backend proxy, and
  NEVER board app data (shared with everyone on the board). Calls go directly
  to `api.anthropic.com` with `dangerouslyAllowBrowser: true`. If someone asks
  to "secure" the key, that means the proxy path the user already declined —
  confirm before changing.
- **The model is user-selectable** via dropdown (Opus default). Adaptive
  thinking is only sent to models that support it.
- **Scope is the full model** — blocks, connectors, slices, fields, and
  Given/When/Then specs — not just blocks + connectors.

Later additions (2026-06-18):

- **Errors are spec-only.** Error stickies are never timeline blocks and never
  connector endpoints — `error` is excluded from the plan's block enum
  (`PLANNABLE_TYPES`). A failing case puts failure labels in the spec's
  `errors` field, rendered as red stickies in the spec's Then zone
  (source-less, so no back-link). This is an event-modeling convention the
  user mandated.
- **Fields are generated too.** The plan schema carries a `fields` array per
  block (name + concrete type); the system prompt teaches the vocabulary, the
  patterns, fields, and the completeness rule (keep a field's name + type
  consistent along a flow, and cover each block's required fields across its
  incoming blocks between them, so no arrow reddens).
- **Rate-limit pacing.** A whole model is write-heavy: `setBulkMode(true)`
  paces board writes (~500 ms/write, race-safe), bulk creates run sequentially,
  and the 429 backoff has a long tail. The build clears bulk mode in `finally`.
- **Interruptible + resumable.** Stop aborts the Claude request (`AbortSignal`)
  and halts the build at the next slice/link/spec boundary (no half-built units,
  no duplicates). Progress is checkpointed to the `em-gen` board-app-data key
  after each unit ([src/features/generateCheckpoint.ts](../src/features/generateCheckpoint.ts)),
  so a paused or crashed build survives panel close / board reload and the
  panel offers Resume/Discard. The *build* truly resumes; the Claude request
  itself can only be cancelled and re-asked (the Messages API isn't resumable).

## Fields: the board display is authoritative (2026-07-15)

Originally only sticky (text-mode) fields were user-editable on the board; a
screen's/automation's attached box was registry-driven — housekeeping rewrote
the box from the `em-fields` record whenever they differed, so editing the box
text did nothing (the panel ignored it) and was reverted within ~4 s. The user
rejected that asymmetry: **the box must behave like a sticky.**

Current rule, both display modes: **what's drawn on the board is the source of
truth; the registry follows.** Concretely, for box mode:

- The panel's reconcile poll watches the box text and parses `name : type`
  lines back into the editor; `syncFieldsFromBoard` and `fieldsHousekeeping`
  *adopt* a differing box text into the registry record instead of rewriting
  the box.
- Housekeeping fits a box's **size and position** to the lines it shows (a
  manual edit changes the line count but Miro never resizes the shape) but
  **never rewrites its text** — so an edit in progress can't be clobbered.
  Content is rewritten only when rebuilding a box that was deleted or evicted;
  formatting normalizes on the next panel save.
- **Emptying the box clears the fields and evicts the box.** Two more
  cautious cuts were rejected in turn: first an emptied box wasn't adopted at
  all, then it was adopted but the empty shape was left on the board. The
  user's call: an empty box has nothing to show, so housekeeping removes it
  and drops its record — the same end state as clearing the fields from the
  panel. A field-less record whose box is already gone is likewise pruned,
  never rebuilt.

The record's remaining job is exactly what frames made necessary (see below):
being the rebuild memory for a box a frame-shrink evicted or deleted.

**The box is identified by a `fields-box` metadata tag, never inferred by
kind.** The first cut recognized "the shape grouped with the element" as the
box, which hijacked any user-drawn shape sharing the group: its text parsed
as fields, then the app rewrote, resized, re-docked, and eventually evicted
it. Now the box is tagged at creation; the recovery scan and the completeness
check accept only tagged shapes (the registry's `card` id stays trusted as
app-written); and housekeeping stamps the tag onto boxes created before
tagging existed, via their registry record, so old boards converge on their
first pass.

## Completeness is judged per target, not per arrow (2026-07-15)

The first cut validated each arrow on its own: the source had to supply every
field the target declared, regardless of what the other arrows into that target
provided. That misreads the fan-in shape event modeling actually uses — a read
model is routinely hydrated by several events, each carrying its own slice of
the whole — so every arrow into such a read model reddened even though the
model was, between them, fully populated. Since the false alarm fires exactly
where the pattern is most idiomatic, the rule was inverted at the user's
request.

Now the sources pointing into a target **pool** their fields, and the target is
satisfied when the pool covers its required fields (name + type; optional
fields exempt). When the pool falls short, **every** arrow into that target
reddens — the shortfall belongs to the target's fan-in, not to any one arrow,
and there is no honest way to pin it on one. Adding the missing field to any
one source clears them all.

Two consequences, both accepted:

- The red no longer pinpoints which path is deficient; it says "look at this
  block and everything feeding it".
- The rule is strictly looser. An arrow whose source supplies none of the
  target's fields is now silent as long as its siblings cover everything.
  Flagging a connector that contributes nothing would be a separate rule; it
  was not asked for.

**Known blind spot, deliberately left:** a block with required fields and *no*
incoming arrows is the maximally incomplete case and shows nothing, because
there is no arrow to redden. Reddening the block itself isn't available —
red is already the error block type in the sticky vocabulary.

## Platform constraints (learned the hard way)

### Board app-data budget is tight (~tens of KB)

Miro's per-board app-data budget is small: writes failed with `The data
storage limit for "appdata" has been exceeded` at a measured total of only
**~31 KB** across all `em-*` keys. Everything stored via the Store port must
stay lean. Measured breakdown at the failure (baseline): em-specs 2.7,
em-slices 2.9, em-links 2.6, em-fields 7.7, em-flags 0.4, **em-gen 15.1 KB**
(a stale generation checkpoint was the bloat).

Mitigations in place:
- Checkpoints carry `savedAt` and auto-expire after 24 h on board load
  (`clearStaleCheckpoint`); the pasted prose is dropped from the checkpoint
  once a plan exists.
- `em-fields` stores no per-field ids (regenerated on read) and **no text-mode
  (sticky) records at all** — a sticky's fields live in its own text and are
  parsed on demand. Only box-mode (screen/automation) records are stored,
  because their box shape can be deleted by a frame-shrink and housekeeping
  needs the record to rebuild it. `compactFieldRegistry` migrates old data on
  board load. The completeness check reads fields from the board, never the
  registry.

To measure live sizes, in the `localhost:3000` console frame:

```js
for (const k of ['em-specs','em-slices','em-links','em-fields','em-flags','em-gen']) {
  console.log(k, JSON.stringify((await miro.board.getAppData(k)) ?? null).length)
}
```

### Failed eventhub requests are environmental, not our rate limit

Failed requests to `https://eventhub.eu01.miro.com/api/stream/v1/import` in
devtools are Miro's realtime/telemetry channel, commonly blocked by ad/content
blockers, tracking protection, VPNs, or corporate proxies — Miro keeps working
regardless (confirmed: disabling the ad blocker made them disappear). Do not
diagnose an app-side rate-limit problem from these; verify in a clean incognito
window first.

The genuine rate-limit signal is a REST 429 from `api.miro.com`, surfaced as
`The API rate limit was exceeded. Requests can use up to 100000 credits in
total per minute.` That is what the hardening targets: the centralized
adaptive limiter in [src/adapters/miro/rateLimit.ts](../src/adapters/miro/rateLimit.ts)
(retries + adaptive pacing on every SDK call), a housekeeping circuit breaker
in [src/index.ts](../src/index.ts), and idempotent completeness connector-color
writes (only write when the live color actually differs).

## Workflow conventions

- **master is the production branch.** Every push to master builds and
  publishes to GitHub Pages (`https://elders.github.io/event-modeler/`) via
  [.github/workflows/deploy.yml](../.github/workflows/deploy.yml). Feature work
  happens on the **`preview`** branch (or short-lived branches off it) and
  lands on master only to ship — never commit work-in-progress to master. The
  Miro app's production App URL points at the Pages site; local dev registers
  `http://localhost:3000`.
- **Commit messages carry no AI attribution** — no `Co-Authored-By: Claude`,
  no "Generated with" footers (explicit user rule, 2026-06-12).
