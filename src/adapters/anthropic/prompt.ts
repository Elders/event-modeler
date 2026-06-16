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
                  enum: [
                    'event',
                    'command',
                    'readModel',
                    'externalEvent',
                    'error',
                    'automation',
                    'screen',
                  ],
                },
                label: { type: 'string' },
                lane: {
                  type: 'integer',
                  enum: [-1, 0, 1],
                  description: '-1 screens, 0 commands & read models, 1 events.',
                },
                column: {
                  type: 'integer',
                  description: 'Step within the slice, 0-based; left to right.',
                },
              },
              required: ['ref', 'type', 'label', 'lane', 'column'],
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
          then: { type: 'array', items: { type: 'string' }, description: 'sticky refs' },
        },
        required: ['slice', 'title', 'given', 'when', 'then'],
      },
    },
  },
  required: ['slices', 'links', 'specs'],
};

export const SYSTEM_PROMPT = `You are an event-modeling expert. Turn the user's description of a system or workflow into an event model and return it as JSON matching the provided schema.

Event modeling lays information flow on a left-to-right timeline, in three horizontal lanes:
- lane -1 (top): screens — a UI the user sees or acts on.
- lane 0 (middle): commands (an intent to change state), read models (data prepared for a user to read), and automations (a process that reacts to state and issues commands).
- lane 1 (bottom): events (a fact that happened — the backbone of the model), external events (a fact from an outside system), and errors (a rejected outcome).

The block types and their meaning:
- event: something that happened, past tense (e.g. "Order placed").
- command: an intent to change state, imperative (e.g. "Place order").
- readModel: data shown to a user or system (e.g. "Order summary").
- externalEvent: a fact arriving from an outside system.
- error: a rejected or failed outcome.
- automation: reacts to state and issues commands (no user involved).
- screen: a UI surface.

A slice is one atomic feature — usually a single step of the flow: a screen (top) → command (middle) → event (bottom), or an event (bottom) → read model (middle) → screen (top). Each slice contains exactly one command or one read model — that single middle block is the spine of the slice; when the flow reaches another command or read model, start a new slice. Break the description into a sequence of slices ordered along the timeline. Most slices are one column; give a block a higher "column" only when a slice genuinely has multiple steps.

Guidance:
- Give every slice and block a short, unique "ref" (e.g. "place-order", "order-placed-evt"). Links and specs reference blocks by these refs.
- Set each block's "lane" by its type using the rules above; set "column" to order steps within a slice (start at 0).
- Add links that follow the flow: screen→command→event, event→readModel→screen, readModel→automation→command, externalEvent→automation→event. Link by ref; only link blocks that exist.
- Write 1–3 specifications for the most important slices. Given = the prior facts/state (events or read models) that must hold; When = the command (or external event) that triggers it; Then = the resulting event(s), or an error sticky for a failing case. Every ref in a spec's given/when/then MUST be a sticky block (event, command, readModel, externalEvent, or error) you defined in some slice — never a screen, an automation, or a slice ref.
- Keep it focused: prefer a clear, correct model of the core flow over exhaustively enumerating every edge case. Aim for roughly 3–8 slices unless the description clearly calls for more.

Return only the JSON.`;
