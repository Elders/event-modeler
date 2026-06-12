// The event-modeling vocabulary: every block the app can place on the board.
//
// The four sticky-note blocks map 1:1 onto Miro's fixed sticky-note palette,
// so models built with the app are indistinguishable from hand-placed stickies.
// Automation and screens are not sticky notes (gear shape / sketch frame or
// image) and are created differently in board.ts.

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

export const STICKY_COLORS: Record<
  StickyBlockType,
  'orange' | 'blue' | 'light_green' | 'yellow' | 'red'
> = {
  event: 'orange',
  command: 'blue',
  readModel: 'light_green',
  externalEvent: 'yellow',
  error: 'red',
};

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
