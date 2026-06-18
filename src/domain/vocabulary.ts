// The event-modeling vocabulary: every block the tool can place, with its
// conventional color. This is pure domain knowledge — no canvas platform is
// referenced here, so it ports unchanged to any host application.
//
// The four sticky-note colors are the conventional event-modeling palette;
// adapters map them onto whatever native colors their canvas provides.

export type BlockType =
  | 'event'
  | 'command'
  | 'readModel'
  | 'externalEvent'
  | 'error'
  | 'automation'
  | 'screen'
  | 'slice';

export type StickyBlockType = Extract<
  BlockType,
  'event' | 'command' | 'readModel' | 'externalEvent' | 'error'
>;

// Everything the palette can place by drag or click: the typed blocks plus the
// tool structures (specification, swimlane, chapter). The tool structures are
// deliberately NOT BlockType — they aren't event-modeling blocks — but they
// share the palette's drag/drop and click-to-place pipeline.
export type PaletteKind = BlockType | 'specification' | 'swimlane' | 'chapter';

// The conventional event-modeling colors. Adapters translate these to native
// canvas colors (e.g. Miro's fixed sticky palette).
export type CardColor = 'orange' | 'blue' | 'light_green' | 'yellow' | 'red';

export const STICKY_COLORS: Record<StickyBlockType, CardColor> = {
  event: 'orange',
  command: 'blue',
  readModel: 'light_green',
  externalEvent: 'yellow',
  error: 'red',
};

export const STICKY_LABEL: Record<StickyBlockType, string> = {
  event: 'Event',
  command: 'Command',
  readModel: 'Read model',
  externalEvent: 'External event',
  error: 'Error',
};

// The reverse of STICKY_COLORS: the block type a sticky's fill color denotes.
// Used to adopt a plain sticky note (one the user drew with the host's own tool,
// carrying no tool metadata) as the matching typed block.
const STICKY_TYPE_BY_COLOR: Record<string, StickyBlockType> = Object.fromEntries(
  (Object.entries(STICKY_COLORS) as [StickyBlockType, CardColor][]).map(([type, color]) => [
    color,
    type,
  ]),
);

// The block type for a sticky's fill color, or null when the color isn't one of
// the conventional event-modeling colors (e.g. gray, violet — no model meaning).
export function stickyTypeForColor(color: string | null | undefined): StickyBlockType | null {
  if (!color) return null;
  return STICKY_TYPE_BY_COLOR[color] ?? null;
}

export interface BlockDef {
  type: BlockType;
  label: string;
  hint: string;
}

export const BLOCKS: BlockDef[] = [
  { type: 'event', label: 'Event', hint: 'a fact, it happened' },
  { type: 'command', label: 'Command', hint: 'intent to change state' },
  { type: 'readModel', label: 'Read model', hint: 'data the user sees' },
  { type: 'externalEvent', label: 'External event', hint: 'from an outside system' },
  { type: 'error', label: 'Error', hint: 'a rejected outcome' },
  { type: 'automation', label: 'Automation', hint: 'reacts, issues commands' },
  { type: 'screen', label: 'Screen', hint: 'sketch or capture' },
  { type: 'slice', label: 'Slice', hint: 'one atomic feature' },
];
