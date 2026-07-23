# Marketplace listing — submission reference

Draft copy and links for the Miro Marketplace submission. Keep this in sync with
what's actually entered in the Partner submission form.

## App name

**Event Modeler** (or **Event Modeler for Miro**).

Do **not** use "Miro Event Modeler" — leading with "Miro" implies Miro built the
app, which the design guidelines forbid.

## App logo / icon

Miro requires **SVG** for both icon slots (not PNG). The two files already exist
in [`branding/`](../branding/) and conform to Miro's rules (SVG, ≤ 5000 bytes,
square, monochrome = one color, no gradients):

| File | Slot | Notes |
| --- | --- | --- |
| [`branding/icon-stack-mono.svg`](../branding/icon-stack-mono.svg) | Outline / monochrome icon (app toolbar) | Single color `#000000`; Miro auto-converts monochrome icons to indigo on upload. |
| [`branding/icon-stack-color.svg`](../branding/icon-stack-color.svg) | Full-color icon | Also serves as the **Marketplace logo**. |

Upload both under the app settings' **Display information** section. No raster
export is needed.

## Description (423 / 450 characters)

> Bring event modeling to your Miro board. Drag typed blocks — events, commands,
> read models, screens, automations — into swimlanes, group them into slices, and
> add Given/When/Then specs. Blocks carry typed fields, and a live check flags any
> arrow whose inputs don't supply what a block needs. Or paste a description and
> let Claude draft the whole model with your own API key. Everything stays a
> native, editable Miro widget.

## Resources & links

| Field | Value |
| --- | --- |
| Website / landing page | https://github.com/Elders/event-modeler |
| Privacy policy (**required**) | `https://elders.github.io/event-modeler/privacy.html` (served from [public/privacy.html](../public/privacy.html); [docs/PRIVACY.md](PRIVACY.md) is the source-of-truth copy) |
| Help center | https://github.com/Elders/event-modeler/blob/master/docs/USER-GUIDE.md |
| Contact support | https://github.com/Elders/event-modeler/issues |

## Categories / tags

Suggested: **Diagramming**, **Software Development**, **Productivity**. Tags:
event modeling, event storming, DDD, specifications, AI.

## App visuals (1–6 images)

Requirements: PNG or GIF, ≤ 8 MB each, ≤ 1258×706, **full bleed** (no rounded
corners or padding), **no white/light-gray background**, explanatory text ≤ 2
lines / ≤ 20 % of the image, no logos in the shots, filenames like
`screenshot-1.png`. Videos: YouTube only.

Shoot on a board with a **tinted background** (a soft blue works well) — a
white/light-gray board blends into the marketplace and violates the background
rule.

### Final set

The chosen screenshots, in listing order. Export the PNGs into
[`branding/screenshots/`](../branding/screenshots/) with these exact names:

| File | Size | Shot | Shows |
| --- | --- | --- | --- |
| `screenshot-1.png` | 1159×706 | Product UI + model (hero) | The Event Modeler panel beside a full model (Register screen → command → event → read model), including the reddened completeness arrow — the app's interface and its differentiator in one frame. |
| `screenshot-2.png` | 1258×704 | Model → spec overview | One slice's model beside its Given/When/Then specification — the whole "model → spec" story in one landscape frame. |
| `screenshot-3.png` | 1029×692 | Completeness check (detail) | A zoomed reddened arrow captioned `timestamp : datetime` — the live check flagging that the command doesn't supply a field the event requires. |

All three: tinted (soft-blue) background, full-bleed, within 1258×706, saved in
[`branding/screenshots/`](../branding/screenshots/). The top Miro logo/Upgrade
bar is cropped from all; #1 intentionally keeps the app panel + left toolbar to
show the product UI. Optional future #4 (not yet shot): the Generate tab drafting
a model from pasted text.

## Scopes

`boards:read`, `boards:write` — minimal; both are used to read the selection/board
and to create the modeling elements.

## Production App URL

Point the app's **App URL** at the deployed HTTPS build (GitHub Pages), not
`http://localhost:3000`.
