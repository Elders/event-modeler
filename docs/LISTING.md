# Marketplace listing — submission reference

Draft copy and links for the Miro Marketplace submission. Keep this in sync with
what's actually entered in the Partner submission form.

## App name

**Event Modeler** (or **Event Modeler for Miro**).

Do **not** use "Miro Event Modeler" — leading with "Miro" implies Miro built the
app, which the design guidelines forbid.

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

Capture the panel **in context on a board with a colored or dark backdrop** — a
screenshot of the light panel on its own would blend into the marketplace and
violate the background rule. Suggested shots:

1. Palette + a small model with swimlanes and slices.
2. Given/When/Then specification stacked under a slice.
3. Fields on a block + a reddened completeness arrow with its caption.
4. Generate tab: pasted text → drafted model.

## Scopes

`boards:read`, `boards:write` — minimal; both are used to read the selection/board
and to create the modeling elements.

## Production App URL

Point the app's **App URL** at the deployed HTTPS build (GitHub Pages), not
`http://localhost:3000`.
