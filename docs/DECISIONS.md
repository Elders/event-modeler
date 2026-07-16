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
  single exception is the completeness check, which recolors under-supplied
  arrows and captions them with the missing fields.
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
satisfied when the pool covers its required fields (name + type; optionality
handled per *Optional supplies nothing* below). When the pool falls short,
**every** arrow into that target reddens — the shortfall belongs to the target's fan-in, not to any one arrow,
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

### The red arrows name the gap (2026-07-15)

A flagged arrow also carries the missing fields as its caption, so the gap
reads off the board without opening the Fields editor and diffing the target
against each source by eye. `completenessGaps` returns connector id → missing
keys (the flagged set is its key set), and `gapCaption` words it.

Settled with the user, don't churn these:

- **On the arrow, not the block.** Since the gap belongs to the fan-in, every
  arrow into a target carries the *same* caption — three events feeding a short
  read model give three identical captions. Accepted; the alternative (captioning
  the target once) was declined. There is no per-arrow refinement available: the
  missing keys are by definition supplied by no source, so "what this source
  fails to supply" and "what the fan-in fails to supply" are the same set.
- **Full list, no truncation.** A target missing six fields gets all six.
- **One key per line**, so a red arrow reads like the field list the target is
  short of, the same way a sticky and the attached box list theirs. `gapCaption`
  joins with `<br>` rather than the `<p>`-per-line that `renderStickyContent` /
  `fieldsBoxContent` use — a caption is an inline label on a line, not a text
  block — but `htmlToLines` splits on both, so the parse side is shared.
- **Bare keys, no prefix.** `total : number` — the red already says it's a
  problem, so no "Missing:" lead-in. Keys are the same `name : type` form used
  on stickies and in the box, in the *target's* field order. The one exception
  is a field the fan-in carries only as optional, which is worded as a sentence
  — see *Optional supplies nothing* below.
- **Hand-written captions are not protected.** The caption array is replaced
  outright; a caption you typed on an arrow that later reddens is destroyed and
  is *not* restored when the gap closes. The user explicitly declined the
  preservation machinery (a marker to identify our caption, or the original
  stashed in `em-flags`) — it cost app-data budget against a tight cap for a
  case that doesn't arise in practice. What remains is scoping, not protection:
  only arrows in the `em-flags` registry are written, so the pass never strips a
  caption off an arrow it didn't flag.

Two implementation constraints, both load-bearing:

- **The caption must not be rewritten on every 4s poll** or the rate limiter
  trips — a stable board must do zero writes. So the pass checks whether the
  line already shows the gap and writes only when it doesn't, including when the
  gap *shrinks* as fields get filled in.
- **That check compares parsed lines, never markup** (`captionShowsGap` over
  `htmlToLines`). Miro hands a caption back in its own HTML, so what we wrote is
  not string-comparable to what we read; only the text is. Comparing the
  rendered string would mismatch on every tick and rewrite forever. Field names
  are user text, so `gapCaption` escapes them — and the escaping is what stops a
  name containing a literal `<br>` from splitting its own line.
  Nothing is stored: `ConnectorFlag` still holds only the pre-red color.

Chapter arrows are safe from all of this — they're free-standing (endpoints are
positions, not items), so the rule skips them and their captions are untouched.

### Optional supplies nothing (2026-07-15)

Optionality started out as a target-side exemption only: an optional field on a
block didn't have to be supplied, but an optional field on a *source* still
counted as supply, because `fieldMatchKey` strips the `?` and both sides were
compared on the bare key. So `email : string?` on an event satisfied a read
model requiring `email : string`, and the arrow stayed black.

That's backwards. A field that may be absent cannot guarantee one that must be
present — the black arrow was promising something the model didn't say. At the
user's request the check now reads optionality on **both** sides: an optional
target field still needs no supplier, and an optional source field supplies
nobody.

- **A required supply anywhere in the fan-in wins.** If one source carries
  `email : string` required and another carries it optionally, the target is
  satisfied — the required one is enough on its own, and pooling is unchanged.
- **The two sets collapsed into one.** With optional exempt on the target and
  inert on the source, "what a target requires" and "what a source supplies" are
  the same computation — the non-optional keys. `completenessGaps` keeps a
  second `optionalById` map, but it satisfies nothing; it exists only to word
  the caption.

**The caption distinguishes the two kinds of gap**, which is the one place this
rule is visible rather than merely correct:

- A field nothing carries at all stays the bare key: `phone : string`.
- A field the fan-in *does* carry, but only optionally, reads
  `Field "email : string" is required`. Listing it as absent would read as a lie
  — it's right there on the upstream block. The sentence names what's actually
  wrong.
- **The full key goes in the quotes, not the name**, because a type mismatch is
  also a gap: a source carrying `email : number` against a target requiring
  `email : string` would make `Field "email" is required` read as false.
- Both formats can therefore appear in one caption, since a target can be short
  of both kinds at once. Uniform wording for every gap was considered and
  declined — the sentence carries information the bare key doesn't, and only
  where it applies.

`gapLines` is the single place the wording lives, shared by `gapCaption` and
`captionShowsGap` — if those two ever disagreed about what a caption should say,
the no-write-on-a-stable-board invariant above would break and the poll would
rewrite the line every 4s forever.

The planner prompt teaches the rule too (never introduce a field as optional
upstream and then require it downstream), or generated models come out red.

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

> **Superseded in part (2026-07-16).** The per-minute message above is only one
> of two budgets, and it is not the one that bit us. See "The polling cadence
> follows activity" below: the `1000000 credits per hour` budget is a sustained
> ceiling, and retries + adaptive pacing are the wrong response to it.

## Failures are reported, never fabricated (2026-07-16)

**The bug.** "After a while, selecting an element with fields shows nothing in
the Fields tab, for every element, and only a board refresh fixes it."

**The cause.** Miro's hourly credit budget running out —
`The API rate limit was exceeded. Requests can use up to 1000000 credits in
total per hour.` Note this is a *different* budget from the per-minute one
recorded above, and a much less forgiving one: the adaptive limiter decays its
gap back to 0 within ~8 successful calls, which is a sensible response to a
per-minute window and far too eager against an hourly one.

But the rate limit only *triggered* it. What made it a latch was that every
layer laundered the failure into a plausible answer:

- `MiroCanvas.getMeta` caught and returned `null` → "this element has no type".
- `MiroStore.read` caught and returned its fallback → "the registry is empty".
- `MiroCanvas.ensureLive` caught → the cache stayed empty and every read below
  silently behaved as though the element had nothing to say.
- `resolveFieldTarget`'s last fallback, `canvas.get`, was the one call that
  *didn't* catch — so it threw into an uncaught `void (async () => {…})()` in
  `FieldsSection`, `setTarget` never ran, and `target` stayed at its initial
  `null`.

`target === null` renders "Select a command, event…". So the panel stated, with
confidence, that the user's selection had no fields — while the truth was that it
had not managed to look. It never recovered because the effect only re-runs when
`selectionKey` changes, and the poll that would have healed it was gated behind
`if (!target) return`.

**The decision.** A failure is reported, never turned into a value. Adapters
propagate; only a supervisor catches; carrying on past a failure requires naming
and checking the condition (`isHostUnavailable`). The rules are in
[CLAUDE.md](../CLAUDE.md); this is why they exist.

**Rejected: "report everything, change no control flow."** Considered, because
it has no regression risk. Declined — it's incoherent. If carrying on is
correct, the condition wasn't an error; if it was an error, carrying on is the
bug. The Fields tab would still have rendered the placeholder over a rate limit,
just with a log line beside it.

**Rejected: "remove every catch."** The `patterns`/`generate` link loops name a
real condition (frames reject connector endpoints — see the SDK landmines), and
one refused link should not abort a 50-block build. They keep their catch, but
must rethrow `HostUnavailableError`: a board that has stopped answering will
refuse the rest of the plan too, and pressing on would produce a model with no
links in it.

**The nastiest one found on the way.** `redockSliceButton` caught its failure
and then recorded the frame's new size anyway. The size-change detector compares
against that record, so it concluded the re-dock was done and never retried —
the button stayed stranded permanently. Swallowing was not the whole bug there;
gating heal state on a step that may have failed was. Hence the corollary in
CLAUDE.md.

**Visibility.** The board script has no UI and its housekeeping runs with the
panel closed, so its `console.warn`s only ever reached a devtools console nobody
had open — which is why this went undiagnosed. Hence the **Console tab** and the
`Diagnostics` port. Transport is a `BroadcastChannel`, never board app data: it
costs no API credits, and the failure being reported is usually the credit budget
running out. Persistence is `localStorage`, off by default (the user's call), and
written by the board page alone — it is the long-lived page and a single writer
means no lost-update race.

## Background work is driven by activity, not a clock (2026-07-16)

The root cause behind the Fields tab outage above. Two budgets exist, and the
section further up this file only knew about one of them:

| Budget | Kind | Behaviour |
| --- | --- | --- |
| `100000 credits per minute` | burst ceiling | transient; retrying rides it out |
| `1000000 credits per hour` | **sustained** ceiling, ~16.7k/min averaged | nothing works until the window rolls |

You can sit far under the burst ceiling and still exhaust the hourly one over an
hour. That is the "after a while".

**What it actually costs.** From the
[Web SDK rate limiting docs](https://developers.miro.com/docs/websdk-reference-rate-limiting):

| Method | Credits | Level |
| --- | --- | --- |
| `miro.board.get`, `board.getSelection` | **500** | 3 |
| `createImage`, `createEmbed`, `image.sync`, `item.getConnectors` | 500 | 3 |
| everything else we call — `item.getMetadata`/`setMetadata`, `getAppData`/`setAppData`, every create, `item.sync` | 50 | 1 |

`board.get` is the expensive one — as costly as creating an image, and 10x a
metadata read. It is the docs' own exception to "most calls are 50", and it is
the call our polling is made of.

The completeness pass made **four** `board.get` calls (all connectors, all
groups, all grouped members, the sticky endpoints) plus a registry read:

```
2,050 credits/pass (+50 per shape grouped with a connected screen)
x 900 passes/hour at a fixed 4s
= 1,845,000 credits/hour   on an EMPTY board, against a 1,000,000 budget
```

Add the 8s loop (~1,800/tick = 810,000/hour, 81% of the budget by itself) and the
board burned ~2.6-3.5M credits/hour. It died roughly 17-20 minutes after loading,
every time. The panel latch above is what made that feel permanent: credits
sawtooth back, but the Fields tab never retried, so only a refresh cleared it.

**This was never about model size.** An earlier draft of this entry blamed the
per-shape metadata reads and concluded the board degraded "as the model grows
past ~20 screens". Wrong: those reads are 50 credits each — the cheap part. The
four `board.get`s are 2,000 of the 2,050, and the 4s poll was over budget at any
board size, including an empty one.

**The fixes**, in order of what they bought:

1. **Passes are driven by activity, not a clock** (`domain/pacing`).
   `selection:update` is a push event and costs nothing, so the board script can
   tell when a human did something without spending anything to find out. A pass
   runs ~2s after activity settles — debounced, so a drag collapses into one pass
   at the end instead of one per 4s for its duration. This is both cheaper and
   *more* responsive than the fixed poll: it fires when you finish an edit rather
   than up to 4s later. A heavy editing hour drops from 900 passes to ~150.
2. **The pass makes one `board.get` fewer.** The grouped members and the
   connector endpoints were fetched separately for ids that largely overlap —
   every endpoint is either a raw id from a connector or an image that is itself a
   group member, so one fetch covers both. 2,050 -> 1,550 per pass.
3. **The hourly 429 is not retried.** It used to burn 7 more calls over ~61s of a
   budget that was already gone. It now fails fast as `HostUnavailableError` and
   sets a cooldown.
4. **Every loop stands down under the cooldown**, completeness included. It was
   exempt on the grounds of being "light (a few reads)" — three `board.get`s is
   not light. `isUnderRateLimit()` was `adaptiveGapMs >= 500`, a reasonable proxy
   for the per-minute limit and useless against the hourly one: the gap halves on
   every success and hits zero after ~8 calls, so the loops resumed within seconds
   and re-exhausted a budget needing minutes to refill. It is a deadline now, not
   a gauge.
5. **The per-shape tag read is cached** (`features/fields/boxTags`). Worth doing —
   50 credits x every shape on every pass — but a third-order term, not the cause.
   A read *failure* is never cached: a cached "no" would silently empty a screen's
   fields for the life of the page.

**Accepted trade-offs (user's call, 2026-07-16).** The idle safety net runs every
**120s** (~47k credits/hour, ~5% of budget) and runs completeness *only*. It
covers the one case activity can't: a change with no local activity anywhere (a
REST/bot edit, or a client whose script died). Everything a human does is covered
by the settle, in ~2s — including another user's edits, since whoever makes a
change has an active page of their own and the repairs are board state everyone
else simply sees. The heavy passes are deliberately excluded from the net: an
idle board has had no edits to repair, and including them would double the idle
cost for nothing.

**Correction to the section above:** it records the limit as "100000 credits in
total per minute" and treats that as the thing to harden against. That is the
burst ceiling only. The hourly budget is the one that actually bites, and the
mitigations listed there (retries, adaptive pacing) are the *wrong* response to
it — they spend more of it.

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
