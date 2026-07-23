// The element-name use-case behind the Properties tab: resolve which named
// element the selection is about, read its current name, and write a new one —
// each kind of element keeping its name where Miro already keeps it:
//
//   * sticky blocks — the first line of the sticky's own text;
//   * screens/automations — the title text element grouped above the image;
//   * slices, specifications, plain frames — the frame's own title;
//   * swimlanes (and other plain shapes) — the shape's own text;
//   * chapters — the caption riding on the free-floating arrow.
//
// No registry and no app data: the board display IS the store, exactly as with
// fields. Every write starts from a fresh read (getFresh / connectorById, both
// getById at Level 1) — an element gets retitled or deleted on the board with
// no event to say so, and a rename built on a stale handle would resurrect old
// text.

import { extractName, escapeHtml } from '../domain/fields';
import { replaceFirstLine } from '../domain/naming';
import { BLOCKS, stickyTypeForColor, type BlockType } from '../domain/vocabulary';
import type { CanvasElement } from '../ports/canvas';
import type { SelectionItem } from '../ports/runtime';
import { services } from '../services';
import { isFieldsBox } from './fields/boxTags';
import { absoluteCenter, addTitleAbove } from './helpers';
import { readSliceRecords } from './slices';
import { readSpecRecords } from './specs/model';

export type NameSubjectKind = 'sticky' | 'title' | 'container' | 'shape' | 'caption';

// One nameable element, resolved from the selection: what it is, what to call
// it, and where its name text actually lives.
export interface NameSubject {
  kind: NameSubjectKind;
  // The subject element itself (sticky, image, frame, shape, connector).
  id: string;
  // The element the name is written to: the title text for 'title' — null when
  // that text is missing and a rename must recreate it — the subject otherwise.
  writeId: string | null;
  // What to call it above the input ("Command", "Slice", "Chapter", …).
  label: string;
  name: string;
}

// What a selected connector is to the Properties tab: a chapter-style
// annotation (free-floating; the caption is its name), the arrow toolset (it
// attaches to something), or gone from the board.
export type ConnectorSubject =
  | { kind: 'chapter'; subject: NameSubject }
  | { kind: 'arrow' }
  | { kind: 'gone' };

function blockLabel(type: BlockType): string {
  return BLOCKS.find((block) => block.type === type)?.label ?? type;
}

// Resolves the one named element a (non-connector) selection is about, or null
// when there is none — several blocks, nothing nameable, a plain image. A
// screen group selection carries its title text and fields box alongside the
// image, so those never disqualify the image as the subject.
export async function resolveNameSubject(items: SelectionItem[]): Promise<NameSubject | null> {
  const cards = items.filter((item) => item.kind === 'card');
  const images = items.filter((item) => item.kind === 'image');
  const containers = items.filter((item) => item.kind === 'container');
  const shapes = items.filter((item) => item.kind === 'shape');
  const texts = items.filter((item) => item.kind === 'text');

  if (cards.length + images.length === 1) {
    return cards.length === 1 ? stickySubject(cards[0].id) : imageSubject(images[0].id);
  }
  if (cards.length + images.length > 1) return null;
  if (containers.length === 1 && shapes.length === 0 && texts.length === 0) {
    return containerSubject(containers[0].id);
  }
  if (shapes.length === 1 && containers.length === 0 && texts.length === 0) {
    return shapeSubject(shapes[0].id);
  }
  if (texts.length === 1 && shapes.length === 0 && containers.length === 0) {
    // A screen's title text selected on its own resolves to its screen; a free
    // text element stays the host's own business.
    return ownerImageSubject(texts[0].id);
  }
  return null;
}

// One connector: a free-floating arrow is a chapter (or sub-chapter) whose
// caption is its name; anything attached belongs to the arrow toolset.
export async function resolveConnectorSubject(connectorId: string): Promise<ConnectorSubject> {
  const connector = await services().canvas.connectorById(connectorId);
  if (!connector) return { kind: 'gone' };
  if (connector.start || connector.end) return { kind: 'arrow' };
  return {
    kind: 'chapter',
    subject: {
      kind: 'caption',
      id: connectorId,
      writeId: connectorId,
      label: 'Chapter',
      name: extractName(connector.caption),
    },
  };
}

async function stickySubject(id: string): Promise<NameSubject | null> {
  const [element] = await services().canvas.getFresh([id]);
  if (!element) return null;
  const type = stickyTypeForColor(element.color);
  return {
    kind: 'sticky',
    id,
    writeId: id,
    label: type ? blockLabel(type) : 'Sticky',
    name: extractName(element.content),
  };
}

// `others` lets a caller that already fetched the group members hand them over
// (minus the image itself) instead of paying the groups() read twice.
async function imageSubject(id: string, others?: CanvasElement[]): Promise<NameSubject | null> {
  const { canvas } = services();
  if (!others) {
    const memberIds = (await canvas.groupMembers(id)).filter((member) => member !== id);
    others = memberIds.length > 0 ? await canvas.getFresh(memberIds) : [];
  }
  const title = others.find((member) => member.kind === 'text') ?? null;
  const meta = await canvas.getMeta(id);
  const typed = meta?.type === 'screen' || meta?.type === 'automation' ? meta.type : null;
  // An image that is neither a typed block nor titled has no name to edit —
  // this is also what keeps the on-canvas "+" buttons out of the editor.
  if (!typed && !title) return null;
  return {
    kind: 'title',
    id,
    writeId: title?.id ?? null,
    label: typed ? blockLabel(typed) : 'Image',
    name: title ? extractName(title.content) : '',
  };
}

// Resolves a group member (a title text, a fields box) to its group's image —
// the element that carries the screen/automation identity.
async function ownerImageSubject(memberId: string): Promise<NameSubject | null> {
  const { canvas } = services();
  const memberIds = await canvas.groupMembers(memberId);
  if (memberIds.length <= 1) return null;
  const members = await canvas.getFresh(memberIds);
  const image = members.find((member) => member.kind === 'image');
  if (!image) return null;
  return imageSubject(image.id, members.filter((member) => member.id !== image.id));
}

async function containerSubject(id: string): Promise<NameSubject | null> {
  const { canvas } = services();
  const [frame] = await canvas.getFresh([id]);
  if (!frame || frame.kind !== 'container') return null;
  const [slices, specs] = await Promise.all([readSliceRecords(), readSpecRecords()]);
  const label = slices.some((record) => record.frame === id)
    ? 'Slice'
    : specs.some((record) => record.frame === id)
      ? 'Specification'
      : 'Frame';
  return { kind: 'container', id, writeId: id, label, name: frame.title ?? '' };
}

async function shapeSubject(id: string): Promise<NameSubject | null> {
  // The app's own fields box names the screen it belongs to, never itself — a
  // "name" written into the box would parse back as a field line.
  if (await isFieldsBox(id)) return ownerImageSubject(id);
  const [shape] = await services().canvas.getFresh([id]);
  if (!shape) return null;
  return {
    kind: 'shape',
    id,
    writeId: id,
    label: 'Swimlane',
    name: extractName(shape.content),
  };
}

// Writes a new name where the subject keeps it, and returns the subject as it
// now stands — the writeId can change when a missing screen title had to be
// recreated, and the caller must keep editing the new text, not recreate
// another one per keystroke.
export async function renameSubject(subject: NameSubject, name: string): Promise<NameSubject> {
  const { canvas } = services();
  switch (subject.kind) {
    case 'sticky':
    case 'shape': {
      // First line only; field lines and note prose after it stay verbatim.
      const [element] = await canvas.getFresh([subject.id]);
      if (!element) throw new Error('This element is no longer on the board.');
      await canvas.apply([{ id: subject.id, content: replaceFirstLine(element.content, name) }]);
      return { ...subject, name };
    }
    case 'title': {
      if (subject.writeId) {
        const [title] = await canvas.getFresh([subject.writeId]);
        if (title) {
          await canvas.apply([
            { id: subject.writeId, content: name.trim() ? escapeHtml(name) : '&nbsp;' },
          ]);
          return { ...subject, name };
        }
      }
      // The title text is gone (deleted, or the image never had one). Nothing
      // to name it with is nothing to rebuild; otherwise recreate it the way
      // screens are built, grouped back with the element.
      if (!name.trim()) return { ...subject, name, writeId: null };
      const [image] = await canvas.getFresh([subject.id]);
      if (!image) throw new Error('This element is no longer on the board.');
      const center = await absoluteCenter(image);
      const title = await addTitleAbove(escapeHtml(name), image, center.x, center.y);
      return { ...subject, name, writeId: title.id };
    }
    case 'container': {
      const [frame] = await canvas.getFresh([subject.id]);
      if (!frame) throw new Error('This frame is no longer on the board.');
      await canvas.apply([{ id: subject.id, title: name }]);
      return { ...subject, name };
    }
    case 'caption': {
      await canvas.setConnectorCaption(subject.id, name.trim() ? name : null);
      return { ...subject, name };
    }
  }
}
