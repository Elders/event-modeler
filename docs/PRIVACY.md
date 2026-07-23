# Privacy Policy — Event Modeler for Miro

_Last updated: 23 July 2026_

Event Modeler is a Miro app that helps you build event-modeling diagrams on a
Miro board. This policy explains what the app accesses, what leaves your
browser, and who processes it. **The app has no backend server of its own**: it
is a static web app loaded by Miro into your board, and it does not collect,
store, or transmit your data to any server operated by the app's authors.

## What the app accesses

**Board content (via the Miro Web SDK).** With the `boards:read` and
`boards:write` scopes you grant at install, the app reads the elements and the
current selection on your board and creates or updates elements (sticky notes,
frames, connectors, images, text) to place the building blocks and models you
ask for. It also stores small amounts of app-specific data on the board (Miro
"app data" and per-element metadata) so features such as specifications, fields,
and the generation checkpoint keep working. All of this stays inside Miro and is
governed by [Miro's Privacy Policy](https://miro.com/legal/privacy-policy/).

**Your Anthropic API key (only if you use "Generate from text").** If you choose
to use the AI generation feature, you enter your own Anthropic API key. It is
stored **only in your browser's `localStorage`, on your own device**. It is
never written to the Miro board and never sent to any server operated by the
app's authors. It is sent only to Anthropic, as the authorization header on the
requests described below.

**Diagnostics and the credit meter.** The app keeps a local log of failures and
a meter of the Miro API credits it has spent, shown in the Console tab. These
live in your browser (in memory, and in `localStorage` only if you tick "Keep
after refresh"). They are never transmitted anywhere.

## What leaves your browser, and to whom

- **Anthropic (only when you run "Generate from text").** The text you paste and
  the model you select are sent directly from your browser to the Anthropic API
  (`api.anthropic.com`), authenticated with your own key, so that Claude can
  draft a model. That text may describe your system or workflow. The app's
  authors never receive or store it. This processing is governed by Anthropic's
  [Privacy Policy](https://www.anthropic.com/legal/privacy) and
  [Usage Policy](https://www.anthropic.com/legal/aup). If you never use the
  generation feature, no data is sent to Anthropic.
- **Miro.** All board reads and writes go through the Miro Web SDK to Miro, your
  host platform.
- **GitHub Pages (hosting).** The app's static files are served from GitHub
  Pages. As with any website, GitHub may record standard request logs (such as
  IP address) to serve the files; see
  [GitHub's Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-privacy-statement).

## What the app does **not** do

- No backend server, database, or account system operated by the app's authors.
- No analytics, tracking, advertising, or third-party trackers.
- No cookies set by the app itself.
- No selling or sharing of your data.

## Data retention and deletion

Your API key and any persisted diagnostics live in your browser's storage. You
can remove them at any time by clearing them from the panel (re-open Settings and
clear the key; use Clear in the Console tab), by clearing your browser storage,
or by uninstalling the app. Board content belongs to you and remains in Miro;
remove app-created elements as you would any Miro element.

## Children

The app is intended for professional and educational use and is not directed at
children under 13.

## Changes to this policy

We may update this policy; the "Last updated" date above will change
accordingly.

## Contact

Questions or requests: open an issue at
<https://github.com/Elders/event-modeler/issues>.
