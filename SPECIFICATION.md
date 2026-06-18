# Event Modeler — Developer Specification

A platform- and stack-agnostic specification for an event-modeling authoring
tool. It describes *what* the tool does and *how it must behave*, not which
canvas platform or technologies implement it. Terms are generic: **canvas**
(the infinite 2D modeling surface), **element** (anything placed on it),
**container** (an element that holds other elements and moves with them),
**link** (a directional arrow between elements), **field** (a named, typed
datum an element carries), and **panel** (the tool's control surface).

---

## 1. Purpose

The tool helps teams build [event models](https://eventmodeling.org): a
blueprint of how information flows through a system over time. The user
assembles typed elements on the canvas, arranges them along a left-to-right
timeline, links them into flows, groups them into feature slices, annotates
them with the data they carry, and documents behavior with Given/When/Then
specifications. The tool can also draft a whole model from a block of prose.

The tool is an *assistant*, not a replacement for the canvas's native editing.
It places and arranges elements; the user keeps using the canvas's own tools
to move, style, connect, and delete them. The tool must never fight native
behavior or duplicate features the canvas already provides.

---

## 2. Domain vocabulary

Event modeling uses a small fixed vocabulary. Each concept has a conventional
color that must be preserved, because practitioners read models by color.

| Concept | Meaning | Representation |
|---|---|---|
| Event | A fact; something that happened. The backbone of the timeline. | Orange card |
| Command | An intent to change state. | Blue card |
| Read model | Data prepared for a user or system to read. | Yellow-green card |
| External event | A fact originating from an outside system. | Yellow card |
| Error | A rejected or failed outcome. | Red card |
| Automation | A process that reacts to state and issues commands. | Icon (§4.3) |
| Screen | A UI the user interacts with — sketch or captured image. | Titled image (§4.4) |
| Slice | One atomic feature (vertical-slice architecture). | Container (§4.5) |

The conventional layout is three horizontal lanes, top to bottom: **Screens**
and **automations** (the actors), then **Commands & read models**, then
**Events**, with time flowing left to right.

Beyond the modeling vocabulary the tool also places two structural
annotations that are *not* event-modeling concepts: the **chapter** marker
(§4.6) and the **swimlane** guide (§8.1).

---

## 3. General element requirements

- **Typed.** Every element the tool creates carries its concept type in a form
  that persists with the document, keeping the model machine-readable
  (enabling completeness checks, validation, and export).
- **Native citizens.** After creation, elements are fully editable with the
  canvas's native tools (move, resize, relabel, restyle, delete, link) and are
  indistinguishable from hand-made elements of the same kind.
- **Field-bearing.** Most typed elements can carry data fields (§5); the tool
  reads and writes those fields without removing the element's native
  editability.
- **Non-disruptive placement.** Creating elements never zooms or recenters the
  view. If new content would fall outside the visible area, the view may
  *expand* to include it, but must never zoom *in*.

---

## 4. Placing elements

### 4.1 The palette

The panel presents one tile per concept plus the tool structures
(specification, swimlane, chapter), supporting two placement gestures:

- **Drag** a tile onto the canvas → the element is created at the drop point.
- **Click** a tile → the element is created at the center of the current view.

A few tiles act on the current selection rather than placing a default:
clicking **Slice** wraps the selected elements in a slice, and clicking
**Specification** can attach the spec to a selected slice (§8.3).

### 4.2 Cards

Events, commands, read models, external events, and errors are uniformly
sized colored cards with an editable label, defaulting to the concept name.

### 4.3 Automation

Visually distinct from cards: a scalable gear icon with an editable **title**
above it. Icon and title move as one unit, and the title scales legibly with
the icon. The title exists so different automations can be named. An automation
that carries fields gains an attached field box beneath it (§5).

### 4.4 Screens

A screen is an editable **title** above a **content image**, moving as one
unit. Two creation paths:

- **Blank sketch** — the content is a bordered white placeholder the user
  draws over with the canvas's freehand tools.
- **Upload** — the content is an uploaded image; the title defaults to the
  file name.

Screens participate in flows: they can be linked like any card, and can carry
fields in an attached box (§5).

### 4.5 Slices

A slice is a named **container** for one atomic feature. Elements placed
inside become its children and move with it. Its default size spans the full
height of the three-lane layout, so slices carve the timeline into vertical
feature strips; its body is transparent so lane guides and contents stay
visible.

Each slice carries an **"add specification" button** affixed to its bottom
edge (§8.3). Affixed controls stay attached at their designated position
through container resizes.

### 4.6 Chapter

A chapter marks a stretch of the timeline as one context, grouping the slices
beneath it. It is a single thick horizontal **link** with an editable caption
riding on the line — one object, not a group, and not an event-modeling block
(it carries no type or fields). Because its endpoints are free positions rather
than attached items, the completeness check (§7) ignores it.

---

## 5. Fields

A field is a **named, typed datum** an element carries — the data that flows
through the model. Every block except errors can carry fields: commands,
events, read models, external events, screens, and automations. Each field has
a name and a type drawn from a fixed set — string, number, date, time,
date-time, UUID — or a free-text **custom** type.

Fields are displayed two ways, by element kind:

- **In-text** (cards) — the fields render as lines inside the card's own text,
  one `name : type` per line, below the block's name. The first line remains
  the name, so a native rename just edits it.
- **Attached box** (screens, automations) — the fields render in a box affixed
  beneath the element and moving with it, since an image has no editable text.

Fields are editable from **both** directions, and the two stay reconciled:

- **On the board** — the user types `name : type` lines directly on a card;
  the tool parses them back into fields.
- **In the panel** — a field editor reflects the current selection, offering a
  name input and a type picker per field, with add and remove controls.

In-text fields are user-authoritative: a manual edit on the board is read back
into the tool's record and never silently overwritten.

---

## 6. Linking

- Flows are drawn with the **canvas's native linking tool**. The tool offers
  no linking features of its own.
- Where the tool generates links itself (pattern stamps, generation), they use
  the platform's **default** link style with no overrides — a generated link
  must be indistinguishable from a hand-drawn one. (The chapter marker, §4.6,
  and the completeness flag, §7, are the only deliberate exceptions: they
  recolor a link on purpose.)

---

## 7. Completeness check

Fields let the tool check that information actually flows: an element that
carries fields must receive those fields from the elements pointing into it.
The rule is evaluated continuously in the background, with no user action.

Each incoming **link** is judged on its own. The source must supply every
field the target declares, matched by **name and type** (a differing type
counts as missing). A link whose source lacks any of the target's fields is
flagged by reddening it; when the gap closes, the link is restored to exactly
the color it had before. Links into a target that carries no fields are never
flagged, and links with a free (unattached) endpoint carry no information and
are ignored.

The check works whenever the canvas is open, whether or not the panel is
(§9). It restores a flagged link to its original color even after the link or
its endpoints are deleted, leaving no stray styling behind.

---

## 8. Features

### 8.1 Swimlane

A single action inserts one **lane guide** — placed one at a time, stack
several for the conventional "Screens", "Commands & read models", and "Events"
rows. Guides are inert decoration: transparent, faintly bordered, never
capturing or occluding the elements modeled on top of them. The tool does not
track them after creation.

### 8.2 Pattern stamps

One click inserts a ready-made, pre-linked element group for a recurring
event-modeling pattern:

| Pattern | Flow |
|---|---|
| State change | Screen → Command → Event (the basic write path) |
| State view | Event → Read model → Screen (the basic read path) |
| Automation | Read model → Automation → Command → Event |
| Translation | External event → Automation → Command → Event |
| Processor todo-list | Command → Event → Read model → Automation → Command → Event (the closing event marks the item done) |
| Reservation | Command → Event → Read model → Automation → Command → Event |
| Lookup table | Screen backed by one or more read models, each hydrated by its own event |
| Projected read model | Command → Event → Read model |

Stamped elements land in their conventional lanes, columns step along the
timeline, and links follow §6.

**Anchor on selection.** If the user has exactly one block of a type the
pattern contains selected, the stamp anchors on it: that block is reused as
the matching node and the rest are placed relative to it, so the pattern lays
out around the user's existing element instead of at the view center.

### 8.3 Specifications

A specification documents one behavioral scenario in **Given / When / Then**
form: a titled **container** with three labeled zones in that order, moving
as a single unit.

**Creation.**
- **Standalone** — created at the center of the view.
- **Attached to a slice** — created via the slice's button (or with the slice
  selected), the spec is placed directly beneath that slice and titled after
  it. Multiple specs under one slice stack vertically with a gap, each new one
  below the lowest existing element under that slice — never overlapping.

**Populating zones with copies.** Originals are never moved into a spec.
Instead, each zone has a **+ button**:

1. Activating the button arms that zone as the copy target and prompts the
   user to select source elements.
2. The user selects one or more **card** elements anywhere on the model; the
   tool places **copies** of them in the armed zone.
3. Selecting anything that is not a card produces a **warning** and leaves the
   zone armed for another try; selecting empty canvas cancels.

**Copies.**
- A copy is a **real typed block**, not a frozen picture: it carries its
  source's type, so it is recognized by the field editor and can carry its own
  fields. Its label and fields are the **user's to edit**.
- Each copy carries a visible, navigable **reference to its original**: the
  copy is recognizable as a copy, and following the reference leads to the
  source element.
- Copies are laid out in a grid within their zone. The column count derives
  from the specification's **current width** — a wider spec fits more copies
  per row. Zones grow in height to fit their copies and the container grows
  downward (its top edge stays put).
- **One-way color sync:** a change to an original's color propagates to its
  copies. Nothing else syncs — a copy's label and fields are never overwritten,
  and copies never propagate back. Deleting a copy merely removes it; deleting
  an original leaves its copies frozen as they are.

**Resize.** When the user resizes a specification, its copies re-grid to the
new column count and the zones and frame recompute — automatically, without
any explicit user action.

**Deletion.** A specification is deleted as a unit: its labels, buttons, and
copies go with it. No orphaned artifacts may remain on the canvas.

### 8.4 Convert

The tool can adopt **plain** board items — ones the user drew with the
canvas's own tools, carrying no tool metadata — into typed elements. Reacting
to the selection, it offers:

- **Stickies by color** — a plain colored card becomes the block its fill
  color denotes (gaining a type and the ability to carry fields). Its existing
  text becomes the block's name; an empty card takes the concept's default
  name. Cards whose color carries no model meaning are left alone.
- **Frames to slice or spec** — a plain container becomes a slice or a
  specification, at the user's choice.

Conversion runs across the whole selection at once and never touches items the
tool already manages.

### 8.5 Generate from text

The tool can draft a **whole model from a block of prose**. A pluggable
*planner* — any text-to-model translator, an LLM being one implementation —
turns the prose into a platform-neutral plan: typed blocks arranged in slices
along the timeline, the links between them, the fields each block carries, and
Given/When/Then specifications. Failure outcomes in a spec are rendered as red
error stickies in its Then zone (the only place errors appear). The tool then
builds the plan on the canvas using the same placement behaviors as the manual
palette, so every generated element is an ordinary typed element afterward.

**Interruptible and resumable.** A generation can be paused mid-build; a build
interrupted by a pause, a reload, or a failure is checkpointed to the document
after each unit of work. The tool offers to resume from exactly where it
stopped — without duplicating anything already placed — or to discard the
paused build.

**Configuration stays out of the document.** Whatever the planner needs to run
(a model choice, any credentials) is the planner's own concern and is stored
with the tool's local configuration, never written into the shared document.

---

## 9. Cross-cutting requirements

- **Always on.** The tool's reactive behaviors — copy propagation, on-canvas
  buttons, automatic re-grid, field-box upkeep, the completeness check,
  deletion cleanup — work whenever the canvas is open, whether or not the
  panel is open.
- **Responsive.** Composite operations (a pattern stamp, a specification)
  appear quickly enough to feel immediate — well under a couple of seconds. A
  bulk operation (generation) may pace itself to respect platform rate limits,
  but stays interruptible throughout.
- **Clear feedback.** Multi-step interactions (arming a zone, copying,
  converting, generating) confirm each step; invalid input warns specifically,
  not generically.

---

## 10. Persistence

Everything the tool needs to recognize and maintain its structures — element
types, the fields each element carries, copy-to-original associations, which
links the completeness check has reddened (and their original color), which
containers are slices and specifications, and the checkpoint of an in-progress
generation — persists with the document and survives reloads and new sessions.
Data written by older versions of the tool must remain readable.

---

## 11. Architecture constraint

**Everything is a component.** Each feature is a self-contained module; each
UI component owns its own styles. Shared primitives live in clearly separated
shared modules. New functionality is added as new components, never by
growing existing ones.

The tool is built as a **hexagonal (ports-and-adapters)** architecture so its
event-modeling logic can be lifted onto a different canvas: a pure domain core
and platform-free use-cases speak only to abstract ports (canvas, store,
notifier, viewport, runtime, planner); the current canvas and the planner are
each one swappable adapter.

---

## 12. Out of scope / non-goals

- Manual linking, link styling, element styling, deletion — the canvas's
  native job. (The tool recolors links only for the chapter marker and the
  completeness flag.)
- Auto-arranging a hand-built model or validating its grammar beyond the
  field-completeness check.
- Lane guides are decoration: no snapping, no enforcement.
- Bidirectional copy sync — propagation is deliberately one-way, and only
  color follows the original.
