# Event Modeler — User Guide

How to use the Event Modeler app on a Miro board: what event modeling is, what
every control does, and how the pieces work together.

---

## 1. What is event modeling?

[Event modeling](https://eventmodeling.org) is a way to blueprint an
information system: instead of boxes-and-arrows architecture diagrams, you
describe **how information flows through the system over time**. A model reads
left to right like a movie storyboard.

The vocabulary is small and color-coded — practitioners read models by color,
so the colors are fixed:

| Block | Color | Meaning |
|---|---|---|
| **Event** | 🟧 Orange | A fact — something that happened. The backbone of the timeline. |
| **Command** | 🟦 Blue | An intent to change state ("Place order"). |
| **Read model** | 🟩 Light green | Data prepared for a user or system to read ("Order list"). |
| **External event** | 🟨 Yellow | A fact arriving from an outside system. |
| **Error** | 🟥 Red | A rejected or failed outcome. Appears only inside specifications. |
| **Note** | ⬜ Gray | A free-text annotation. Not part of the model's flow. |
| **Automation** | ⚙️ Gear icon | A process that reacts to state and issues commands — no user involved. |
| **Screen** | 🖼 Titled image | A UI the user interacts with — a sketch surface you draw on. |

The conventional layout is **three horizontal lanes**, top to bottom:

1. **Screens & automations** — the actors,
2. **Commands & read models** — the requests and views,
3. **Events** — the timeline of facts,

with **time flowing left to right**. Vertical **slices** carve this timeline
into atomic features; **chapters** above the model group slices into larger
contexts.

Because the color *is* the type, any plain Miro sticky in one of these colors
is recognized as its block — you can keep sketching with Miro's native sticky
tool and the app understands the result.

---

## 2. Getting started

1. Open a Miro board where the Event Modeler app is installed.
2. Click the app's icon in Miro's left toolbar — the panel opens.
3. The panel has four tabs: **Build** (the manual palette), **Fields** (the
   data editor for the selected block), **Generate** (draft a model from text
   with AI), and **Console** (anything the app failed to do — the tab marks
   itself when there's something to see, so you can ignore it until it does).

The app is an assistant, not a replacement for Miro: everything it places is
an ordinary Miro item afterward. You move, resize, relabel, restyle, connect,
and delete with Miro's own tools. In particular, **arrows between blocks are
drawn with Miro's native connector tool** — the app has no linking feature of
its own.

Some behaviors (spec upkeep, the completeness check, on-board buttons) run in
the background the whole time the board is open, even with the panel closed.

---

## 3. The Build tab

### 3.1 Building blocks

A grid of tiles, one per block plus three tool structures. Two gestures:

- **Drag** a tile onto the board → the element is created where you drop it.
- **Click** a tile → the element is created at the center of your current view.

The view never zooms or jumps when the app places something; at most it
expands to keep new content visible.

| Tile | What you get |
|---|---|
| **Event / Command / Read model / External event / Error / Note** | A colored sticky with the block name as its text. Rename it by editing the sticky's first line. |
| **Automation** | A gear icon with an editable title above it, grouped to move as one. |
| **Screen** | An editable title above a dashed white sketch surface, grouped to move as one. Draw your UI over it with Miro's pen/shapes, or link it into flows like any block. **Click behaves specially:** with plain images selected (screenshots, mockups you pasted onto the board), the tile converts them into screens instead — its hint switches to e.g. *"convert 2 selected images"* while they're selected. A drag still places a new sketch screen. |
| **Slice** | A transparent frame sized to span the three lanes. **Click behaves specially:** with elements selected, the slice wraps *around your selection*; with nothing selected (or on drag), you get a default-size slice. Elements inside a slice move with it. |
| **Specification** | A Given/When/Then frame (see §6). **Click behaves specially:** with a slice selected, the spec attaches beneath that slice and takes its name; otherwise it appears standalone at the view center. |
| **Swimlane** | One horizontal lane guide. Place three and label them "Screens", "Commands & read models", "Events" for the conventional layout. Guides are pure decoration — nothing snaps to them. |
| **Chapter** | A thick blue horizontal arrow with an editable caption riding on the line. Place it *above* the model to mark a stretch of the timeline as one context; optionally stack narrower chapter arrows beneath it as sub-chapters. |

### 3.2 Pattern stamps

One click inserts a ready-made, pre-linked group of blocks for a recurring
event-modeling pattern, laid out in the conventional lanes:

| Stamp | Flow | When to use |
|---|---|---|
| **State change** | Screen → Command → Event | The basic write path: a user acts on a screen. |
| **State view** | Event → Read model → Screen | The basic read path: an event feeds what a screen shows. |
| **Automation** | Read model → Automation → Command → Event | A process reacts to state, no user involved. |
| **Translation** | External event → Automation → Command → Event | Absorb an outside system's event into your model. |
| **Processor todo-list** | Command → Event → Read model → Automation → Command → Event | An event queues work; an automation works items off and the closing event marks them done. |
| **Reservation** | Command → Event → Read model → Automation → Command → Event | Tentatively hold a limited resource, then confirm. |
| **Lookup table** | Screen ← Read models ← Events | A screen backed by several read models, each hydrated by its own event. |
| **Projected read model** | Command → Event → Read model | A write that is immediately projected into a view. |

**Anchoring:** if you have exactly **one** block selected whose type appears in
the pattern, the stamp builds *around it* — your block is reused as the
matching node and only the missing pieces are added. With no matching
selection, the pattern lands at the view center.

Stamped arrows use Miro's default connector style, indistinguishable from ones
you draw yourself.

### 3.3 Convert

This section reacts to your selection. Select one or more **plain frames**
(drawn with Miro's own frame tool) and it offers **Slice** / **Spec** buttons
to adopt them as app-managed structures.

Sticky notes never need converting — their fill color already sets their block
type. A plain orange sticky *is* an event as far as the app is concerned.

Plain **images** (screenshots, pasted mockups) convert too, via the **Screen**
tile in Building blocks: select the images and click the tile (§3.1). Each one
gains an editable title and becomes a real screen — it can carry fields and
anchor patterns like any other block.

---

## 4. The Fields tab

Fields are the data a block carries — the payload that flows through the
model. Every block except errors and notes can carry them: commands, events,
read models, external events, screens, and automations.

1. Select a block on the board; the Fields tab shows its type and fields.
2. The list is an **accordion**: every field is one collapsed line showing
   exactly what the board renders — `full_name > name : string[]? = Ada` —
   with a dimmer second line for the example when the field has one. Click a
   line to open its editor (one open at a time); **Escape** or a click on the
   editor's background closes it. **+ Add field** appends a fresh field and
   opens it.
3. The open editor: a **name** input and a **type** picker — string, number,
   boolean, date, time, date-time, UUID, or **custom** (which reveals a
   free-text type-name input) — on the first line, with **×** to remove the
   field. Below them, five toggles in the order the marks render on the board:
   **`[]`** collection, **`!`** generated, **`?`** optional, **`→`** fed-by
   (reveals an input for the upstream name(s)), and **`=`** example (reveals
   an input for the sample value). Pressing **Enter** in a name input inserts
   a new field directly below that row and moves focus into it, wherever the
   row sits in the list.
4. Reorder fields by dragging a row's **⠿ grip** (or focus the grip and use
   the arrow keys); the block on the board redraws in the new order.
5. Changes save immediately.

**Optional fields (`?`).** A field marked optional may or may not be there at
runtime; a plain field is one the block always carries. Optional shows on the
board as a **`?` after the type** — `email : string?` — and you can type that
`?` directly on the block instead of using the toggle. The distinction is not
just documentation: it changes the completeness check (§5) on both sides.

**Generated fields (`!`).** A generated field is one the block makes itself at
runtime — a command handler assigning a fresh id, say — rather than receiving
from an incoming block. It shows as a **`!` right after the type** —
`id : UUID!`. The completeness check (§5) never expects an incoming arrow to
supply it, but downstream blocks can count on it like any required field.

**Collections (`[]`).** A collection field carries many of its type rather
than one: `tags : string[]`. Purely how the field reads — the completeness
check doesn't care about cardinality. When marks combine, the order is always
`type[]!?` — `ids : UUID[]!?` in the rare full case.

**Examples (`=`).** A field can carry a sample value, shown at the very end of
the line: `name : string = Ada Lovelace`. Free text — commas, colons, spaces
are all fine. Documentation only: the completeness check ignores it and a red
arrow's caption never includes it. You can type one directly on the block —
everything after the first `=` following the type is the example.

**Fed by (`→`).** A field supplied by a differently-named upstream field can
name its source(s): a read model's `name` fed by an event's `full_name`
renders **`full_name > name : string`** — source first, pointing the way the
data flows. Comma-separate alternatives (`full_name, display_name > name`)
when the same datum can arrive under either name; any one of them satisfies
the field (§5). The alias is intake-only — downstream, the block still
supplies plain `name`.

A field **name cannot contain a colon or a `>`** — the colon separates the
name from the type and the `>` separates the upstream names from the field's
own, so the first of either on a line always ends what came before. The
panel's name boxes simply won't take them (and the generator won't produce
them), but ones you type onto a block yourself are read as separators:
`order:id : uuid` becomes a field named `order` of a type called `id : uuid`.
Name fields `orderId`, not `order:id`. Type names are unaffected — everything
after the first colon is the type, so a custom type may contain either. An
`=` is fine in a name — it only means something after the type.

Where fields appear on the board:

- **Stickies** — fields render as lines in the sticky's own text, one
  `name : type` per line below the block's name. The first line stays the
  name, so renaming the sticky natively just works. You can also **type field
  lines directly on the sticky** — the app parses them back; your on-board
  edits win and are never overwritten.
- **Screens & automations** — an image has no text, so fields render in a
  small box attached beneath the element, grouped to travel with it. The box
  is editable just like a sticky: **type `name : type` lines directly in it**
  and the app adopts them — your on-board edits win and are never overwritten.
  The box resizes itself to fit the lines within a few seconds.
  If the box is ever lost (e.g. a frame resize swallowed it), the app rebuilds
  it automatically within a few seconds. Deleting every line clears the
  block's fields, just like on a sticky, and the now-empty box is removed
  automatically a few seconds later — the same end state as clearing the
  fields from the panel. Your own shapes are safe: the app recognizes its
  fields box by an internal tag, so a shape you drew and grouped with a
  screen is never touched.

---

## 5. The completeness check (why an arrow turns red)

Fields let the app verify that information actually *flows*. Continuously, in
the background:

> Everything pointing into a block must, **between them**, supply every field
> that block requires — matched by **name alone**.

The check judges a **block and its whole fan-in at once**, not one arrow at a
time. All the blocks feeding a target pool their fields, and the target is
satisfied when that pool covers what it requires. No single source has to carry
the whole payload: a read model hydrated by three events is complete when the
three events *together* supply its fields, even though no one event does.

**Only the name matters for the match.** Types are documentation: they render
everywhere a field is shown, but a required `email : string` is satisfied by
any upstream field named `email`, whatever type either side declares. A field
with a **fed-by alias** (§4) is satisfied by any of its declared names too —
`full_name, display_name > name` is covered by a source carrying `full_name`,
one carrying `display_name`, or one carrying `name` itself.

**Generated fields don't need feeding.** A `!` field (§4) is made by the block
itself, so incoming arrows are never expected to supply it — but blocks
downstream can rely on it exactly like any required field.

When the pool falls short, **every** arrow into that block turns **red** — the
shortfall belongs to the fan-in as a whole, and there's no honest way to pin it
on one arrow. They all report the same gap, and adding a missing field to any
one source clears them all at once.

**Optional counts on both sides.** An optional field (the `?` from §4) is
exempt as a target and useless as a source:

- On the **target** — an optional field need not be supplied by anyone.
- On a **source** — an optional field supplies nobody. A field that may be
  absent can't guarantee one that must be present.

So `email : string?` on an upstream block does **not** satisfy a required
`email : string` downstream — the arrow stays red until some source carries it
as required, or the target's own field is marked optional. One source carrying
it as required is enough, however many others carry it only optionally.

**An arrow that contributes nothing reddens alone.** Even when the fan-in as a
whole covers the target, an arrow whose own source supplies **none** of the
target's required fields (an optional-only match counts as none) turns red by
itself, captioned *`Supplies none of the required fields`* — a link that's
wired up but carries no data shouldn't hide behind its siblings. Supplying
just one relevant field clears it, so a source carrying its own slice of a
multi-event hydration is never caught.

**A red arrow tells you what's missing.** Each flagged arrow is captioned with
the shortfall, one missing field per line, in the target's field order. The
field is named the way the target displays it — aliases included, example
omitted:

- `total : number` — nothing feeding the block carries this field at all.
- `Field "email : string" is required` — the fan-in *does* carry that name,
  but only as optional. Drop the `?` upstream.
- `Supplies none of the required fields` — this arrow's own source carries
  nothing the target needs (see above); the other arrows may be fine.

Close the gap and the arrow returns to exactly the color it had before, usually
within a few seconds. Note that the caption **overwrites any text the arrow
already had, and that text is gone for good** — when the gap closes the app
removes its own caption and leaves the line blank rather than restoring what
was there. Arrows the check never flagged are never captioned or cleared, so
text you write on an arrow that stays black is safe.

Notes: a block that requires no fields is never flagged — nor is one whose
fields are all optional or generated; arrows with a loose (unattached) end are
ignored. The check runs whether or not the panel is open.

---

## 6. Specifications (Given / When / Then)

A specification documents one behavioral scenario: a titled frame with three
zones — **Given** (the events that already happened), **When** (the command),
**Then** (the expected events or errors).

**Creating one** — three ways:

- Click the **Specification** tile (standalone, at the view center).
- Select a slice, then click the **Specification** tile — it attaches beneath
  the slice and is titled after it.
- Click the **＋ button docked to a slice's bottom edge** — same result,
  without opening the panel. Multiple specs under one slice stack downward,
  never overlapping.

**Filling the zones with copies.** Originals never move into a spec. Each zone
has its own on-board **＋ button**:

1. Click a zone's **＋** — a toast confirms, e.g. *"Now select the items to
   copy into Given."* The zone is now armed.
2. Select one or more stickies anywhere on the model (multi-select works).
   Copies of them appear in the armed zone, laid out in a grid.
3. Selecting something that isn't a sticky shows a warning and keeps the zone
   armed; clicking empty canvas disarms it.

**About copies:**

- A copy is a **real, typed, editable block** — not a snapshot. Edit its label,
  give it its own fields; it's yours.
- Each copy links back to its original, so you can always navigate to the
  source.
- Only **color** follows the original (recolor the original and its copies
  follow). Labels and fields never sync in either direction; deleting a copy
  removes just the copy; deleting an original leaves its copies as they are.
- Failure cases appear as **red error stickies in the Then zone** — the only
  place errors belong in an event model.

**Resizing:** drag the spec frame wider or narrower and the copies re-grid to
fit, zones recompute their heights, and the frame grows downward as needed —
automatically.

**Deleting:** delete the spec frame and the app cleans up everything that
belonged to it (labels, buttons, copies) — no debris left behind.

---

## 7. The Generate tab (AI drafting)

Paste a prose description of a system — the app has Claude draft a complete
model: slices along a timeline, typed blocks in their lanes, the arrows
between them, fields on every block, and Given/When/Then specs per slice.

**One-time setup:** open **Settings** at the bottom of the tab and paste your
Anthropic API key (get one at console.anthropic.com). The key is stored **only
in your browser** — never on the board, never visible to other board members.
Pick a model from the dropdown; the default is the most capable.

**Using it:**

1. Paste or type a description into the text box — e.g. *"A customer places an
   order, payment is taken, the order is shipped…"*. More detail yields a
   richer model.
2. Click **Generate model**. Planning takes a little while (the AI call), then
   blocks appear slice by slice. Generation deliberately paces itself to
   respect Miro's rate limits, so a large model builds steadily rather than
   all at once.
3. **Pause** stops the build gracefully at the next block boundary.

**Resuming:** a paused, interrupted, or failed build is checkpointed on the
board after every step. Reopen the panel any time (even after a reload) and a
banner shows the progress — e.g. *"Generation paused — 3 of 7 slices done."* —
with **Resume** (continue exactly where it stopped, no duplicates) and
**Discard** (drop the checkpoint) buttons. An unfinished checkpoint expires by
itself after 24 hours.

Everything generated is ordinary, fully editable model content — same as if
you had placed it by hand.

---

## 8. Tips & troubleshooting

- **An arrow turned red** — that's the completeness check (§5): the blocks
  feeding its target don't supply, between them, every field the target
  requires. Read the arrow's caption — it names exactly what's missing. Every
  arrow into that target reddens together, so adding the gap to any one source
  clears the lot.
- **A red arrow lists a field I can see upstream** — the caption reads
  *`Field "…" is required`* when an upstream block carries that field but marks
  it optional (`?`). An optional field supplies nobody (§5); drop the `?` on
  the source, or mark the target's field optional too.
- **One arrow is red while its siblings are black** — its caption reads
  *`Supplies none of the required fields`*: the target is covered, but this
  arrow's own source contributes nothing to it (§5). Give the source one of
  the target's fields, or name it as a fed-by alias on the target.
- **Something didn't update immediately** — background upkeep (spec re-layout,
  field-box healing, arrow recoloring) runs on a few-seconds cycle. Give it a
  moment before assuming something's wrong.
- **The panel closed but buttons still work** — by design. The on-board ＋
  buttons, copy flow, completeness check, and spec upkeep run for the whole
  board session.
- **Use native Miro freely** — recolor, restyle, move, group, delete. The app
  never fights Miro. A plain sticky in a model color is a real block; a plain
  frame can be adopted via **Convert** (§3.3).
- **Don't look for a linking feature** — connect blocks with Miro's own
  connector tool (hover a sticky's edge and drag). The app only draws arrows
  inside pattern stamps and generated models.
- **The board display is the source of truth for fields** — feel free to edit
  `name : type` lines right on a sticky, or in a screen's/automation's
  attached box; the Fields tab picks the edits up.
