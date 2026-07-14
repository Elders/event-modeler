// The instruction and output contract handed to Claude. The vocabulary it
// teaches is the domain's (imported, not duplicated); the phrasing and the
// JSON Schema that constrains the response are adapter concerns.

// JSON Schema for the structured-output response. Structured outputs forbid
// numeric ranges and require `additionalProperties: false` on every object, so
// the shape below stays flat: enums for the closed sets, plain integers for
// lane/column. It mirrors the ModelPlan that `normalizePlan` expects.
export const PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    slices: {
      type: 'array',
      description: 'Feature slices, left to right along the timeline.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ref: { type: 'string', description: 'Unique id used by links and specs.' },
          title: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                ref: { type: 'string', description: 'Unique id used by links and specs.' },
                type: {
                  type: 'string',
                  enum: ['event', 'command', 'readModel', 'externalEvent', 'automation', 'screen'],
                },
                label: { type: 'string' },
                lane: {
                  type: 'integer',
                  enum: [-1, 0, 1],
                  description: '-1 screens & automations (actors), 0 commands & read models, 1 events.',
                },
                column: {
                  type: 'integer',
                  description: 'Step within the slice, 0-based; left to right.',
                },
                fields: {
                  type: 'array',
                  description:
                    'Data this block carries. Add fields to data-bearing blocks (command, event, readModel, screen, automation); use [] for any block with no data.',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      type: {
                        type: 'string',
                        enum: ['string', 'number', 'boolean', 'date', 'time', 'datetime', 'uuid'],
                      },
                    },
                    required: ['name', 'type'],
                  },
                },
              },
              required: ['ref', 'type', 'label', 'lane', 'column', 'fields'],
            },
          },
        },
        required: ['ref', 'title', 'blocks'],
      },
    },
    links: {
      type: 'array',
      description: 'Directional arrows between blocks, by ref.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['from', 'to'],
      },
    },
    specs: {
      type: 'array',
      description: 'Given/When/Then specifications, each attached to one slice.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slice: { type: 'string', description: 'ref of the slice this documents.' },
          title: { type: 'string' },
          given: { type: 'array', items: { type: 'string' }, description: 'sticky refs' },
          when: { type: 'array', items: { type: 'string' }, description: 'sticky refs' },
          then: { type: 'array', items: { type: 'string' }, description: 'sticky refs (events)' },
          errors: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Failure outcomes for this spec, as short labels (e.g. "Payment declined"). Shown as red error stickies in the Then zone. Errors live ONLY here — never as a timeline block, never a link endpoint. Use [] for a success spec.',
          },
        },
        required: ['slice', 'title', 'given', 'when', 'then', 'errors'],
      },
    },
  },
  required: ['slices', 'links', 'specs'],
};

export const SYSTEM_PROMPT = `You are an event-modeling expert. Turn the user's description of a system or workflow into an event model and return it as JSON matching the provided schema.

Event modeling lays information flow on a left-to-right timeline, in three horizontal lanes:
- lane -1 (top): actors — screens (a UI the user sees or acts on) and automations (a process that reacts to state and issues commands, with no user). Both drive the model from the top.
- lane 0 (middle): commands (an intent to change state) and read models (data prepared for a user to read).
- lane 1 (bottom): events (a fact that happened — the backbone of the model) and external events (a fact from an outside system).

The block types and their meaning:
- event: something that happened, past tense (e.g. "Order placed").
- command: an intent to change state, imperative (e.g. "Place order").
- readModel: data shown to a user or system (e.g. "Order summary").
- externalEvent: a fact arriving from an outside system.
- automation: reacts to state and issues commands (no user involved).
- screen: a UI surface.
Use the whole vocabulary where the description calls for it — screens for UI, automations for reactions the system performs on its own, external events for facts from other systems — not just commands and events.

Errors are NOT timeline blocks. A failure outcome (e.g. "Payment declined") is never a block in a slice and never has an arrow — it belongs only in a specification, listed in that spec's "errors" field (see below).

A slice is one atomic feature — usually a single step of the flow: a screen (top) → command (middle) → event (bottom), or an event (bottom) → read model (middle) → screen (top). Each slice contains exactly one command or one read model — that single middle block is the spine of the slice; when the flow reaches another command or read model, start a new slice. Break the description into a sequence of slices ordered along the timeline. Most slices are one column; give a block a higher "column" only when a slice genuinely has multiple steps.

Patterns — most slices follow one of four shapes; use whichever fits:
- command: screen → command → event (a user action causes a fact).
- view: event → read model → screen (a fact updates what a user sees).
- automation: read model → automation → command → event (the system reacts with no user).
- translation: external event → automation → event (an outside fact becomes an internal one).

Fields — the data each block carries:
- Give every data-bearing block (command, event, readModel, screen, automation) a "fields" list; each field has a "name" and a "type" (string, number, boolean, date, time, datetime, or uuid). Use an empty list ([]) for a block with no data.
- Information flows along the arrows: a field a block holds must come from a block pointing into it, and a field keeps the SAME name and type everywhere it travels (an "orderId : uuid" on a command stays "orderId : uuid" on the event it produces). The board runs an information-completeness check — if a block declares a field that no block pointing into it provides (matched by name and type), the arrow into that block turns red. So introduce each field where it originates and carry it forward unchanged, so the generated model comes out complete (no red arrows).

Guidance:
- Give every slice and block a short, unique "ref" (e.g. "place-order", "order-placed-evt"). Links and specs reference blocks by these refs.
- Set each block's "lane" by its type using the rules above; set "column" to order steps within a slice (start at 0).
- Add links that follow the flow (the patterns above): screen→command→event, event→readModel→screen, readModel→automation→command, externalEvent→automation→event. Link by ref; only link blocks that exist.
- Write 1–3 specifications for the most important slices. Given = the prior facts/state (events or read models) that must hold; When = the command (or external event) that triggers it; Then = the resulting event(s) for a success case. Every ref in a spec's given/when/then MUST be a sticky block (event, command, readModel, or externalEvent) you defined in some slice — never a screen, an automation, or a slice ref. For a FAILING case, leave "then" for the events and put the failure outcome(s) in the spec's "errors" list (short labels) — these become red error stickies inside the spec, and are the only place errors appear.
- Keep it focused: prefer a clear, correct model of the core flow over exhaustively enumerating every edge case. Aim for roughly 3–8 slices unless the description clearly calls for more.

Return only the JSON.`;
