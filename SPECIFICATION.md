# Event Modeler — Developer Specification

A platform- and stack-agnostic specification for an event-modeling authoring
tool. It describes *what* the tool does and *how it must behave*, not which
canvas platform or technologies implement it. Terms are generic: **canvas**
(the infinite 2D modeling surface), **element** (anything placed on it),
**container** (an element that holds other elements and moves with them),
**link** (a directional arrow between elements), and **panel** (the tool's
control surface).

---

## 1. Purpose

The tool helps teams build [event models](https://eventmodeling.org): a
blueprint of how information flows through a system over time. The user
assembles typed elements on the canvas, arranges them along a left-to-right
timeline, links them into flows, groups them into feature slices, and
documents behavior with Given/When/Then specifications.

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

The conventional layout is three horizontal lanes, top to bottom: **Screens**,
then **Commands & read models**, then **Events**, with time flowing left to
right.

---

## 3. General element requirements

- **Typed.** Every element the tool creates carries its concept type in a form
  that persists with the document, keeping the model machine-readable
  (enabling future grammar checks, validation, and export).
- **Native citizens.** After creation, elements are fully editable with the
  canvas's native tools (move, resize, relabel, restyle, delete, link) and are
  indistinguishable from hand-made elements of the same kind.
- **Non-disruptive placement.** Creating elements never zooms or recenters the
  view. If new content would fall outside the visible area, the view may
  *expand* to include it, but must never zoom *in*.

---

## 4. Placing elements

### 4.1 The palette

The panel presents one tile per concept, supporting two placement gestures:

- **Drag** a tile onto the canvas → the element is created at the drop point.
- **Click** a tile → the element is created at the center of the current view.

### 4.2 Cards

Events, commands, read models, external events, and errors are uniformly
sized colored cards with an editable label, defaulting to the concept name.

### 4.3 Automation

Visually distinct from cards: a scalable gear icon with an editable **title**
above it. Icon and title move as one unit, and the title scales legibly with
the icon. The title exists so different automations can be named.

### 4.4 Screens

A screen is an editable **title** above a **content image**, moving as one
unit. Two creation paths:

- **Blank sketch** — the content is a bordered white placeholder the user
  draws over with the canvas's freehand tools.
- **Upload** — the content is an uploaded image; the title defaults to the
  file name.

Screens participate in flows: they can be linked like any card.

### 4.5 Slices

A slice is a named **container** for one atomic feature. Elements placed
inside become its children and move with it. Its default size spans the full
height of the three-lane layout, so slices carve the timeline into vertical
feature strips; its body is transparent so lane guides and contents stay
visible.

Each slice carries an **"add specification" button** affixed to its bottom
edge (§6.3). Affixed controls stay attached at their designated position
through container resizes.

---

## 5. Linking

- Flows are drawn with the **canvas's native linking tool**. The tool offers
  no linking features of its own.
- Where the tool generates links itself (pattern stamps only), they use the
  platform's **default** link style with no overrides — a generated link must
  be indistinguishable from a hand-drawn one.

---

## 6. Features

### 6.1 Swimlanes

A single action inserts three stacked **lane guides** labeled "Screens",
"Commands & read models", and "Events". Guides are inert decoration:
transparent, faintly bordered, never capturing or occluding the elements
modeled on top of them. The tool does not track them after creation.

### 6.2 Pattern stamps

One click inserts a ready-made, pre-linked element group for a recurring
event-modeling pattern:

| Pattern | Elements (lane) | Links |
|---|---|---|
| Command | Screen (top) → Command (mid) → Event (bottom) | screen→command→event |
| View | Event (bottom) → Read model (mid) → Screen (top) | event→readmodel→screen |
| Automation | Read model → Automation → Command → Event | chained |
| Translation | External event → Automation → Event | chained |

Stamped elements land in their conventional lanes, columns step along the
timeline, and links follow §5.

### 6.3 Specifications

A specification documents one behavioral scenario in **Given / When / Then**
form: a titled **container** with three labeled zones in that order, moving
as a single unit.

**Creation.**
- **Standalone** — created at the center of the view.
- **Attached to a slice** — created via the slice's button (or with the slice
  selected), the spec is placed directly beneath that slice and titled after
  it. Multiple specs under one slice stack vertically with a gap, each new one
  below the lowest existing element under that slice — never overlapping.

**Populating zones with linked copies.** Originals are never moved into a
spec. Instead, each zone has a **+ button**:

1. Activating the button arms that zone as the copy target and prompts the
   user to select source elements.
2. The user selects one or more **card** elements anywhere on the model; the
   tool places **copies** of them in the armed zone.
3. Selecting anything that is not a card produces a **warning** and leaves the
   zone armed for another try; selecting empty canvas cancels.

**Copies.**
- Each copy carries a visible, navigable **reference to its original**:
  the copy is recognizable as a copy, and following the reference leads to
  the source element.
- Copies are laid out in a grid within their zone. The column count derives
  from the specification's **current width** — a wider spec fits more copies
  per row. Zones grow in height to fit their copies and the container grows
  downward (its top edge stays put).
- **One-way propagation:** edits to an original's label or color propagate to
  its copies. Copies never propagate back. Deleting a copy merely removes it;
  deleting an original leaves its copies frozen as they are.

**Resize.** When the user resizes a specification, its copies re-grid to the
new column count and the zones and frame recompute — automatically, without
any explicit user action.

**Deletion.** A specification is deleted as a unit: its labels, buttons, and
copies go with it. No orphaned artifacts may remain on the canvas.

---

## 7. Cross-cutting requirements

- **Always on.** The tool's reactive behaviors — copy propagation, on-canvas
  buttons, automatic re-grid, deletion cleanup — work whenever the canvas is
  open, whether or not the panel is open.
- **Responsive.** Composite operations (a pattern stamp, a specification)
  appear quickly enough to feel immediate — well under a couple of seconds.
- **Clear feedback.** Multi-step interactions (arming a zone, copying) confirm
  each step; invalid input warns specifically, not generically.

---

## 8. Persistence

Everything the tool needs to recognize and maintain its structures — element
types, copy-to-original associations, which containers are slices and
specifications — persists with the document and survives reloads and new
sessions. Data written by older versions of the tool must remain readable.

---

## 9. Architecture constraint

**Everything is a component.** Each feature is a self-contained module; each
UI component owns its own styles. Shared primitives live in clearly separated
shared modules. New functionality is added as new components, never by
growing existing ones.

---

## 10. Out of scope / non-goals

- Manual linking, link styling, element styling, deletion — the canvas's
  native job.
- Auto-arranging the model or validating its grammar (a future use of the
  type tags from §3).
- Lane guides are decoration: no snapping, no enforcement.
- Bidirectional copy sync — propagation is deliberately one-way.
