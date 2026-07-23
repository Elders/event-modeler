// Moving fields across an arrow: what a field looks like once copied from one
// block to another, and how an incoming list lands on the receiver's. Pure
// domain — the arrow feature composes these; nothing here touches a port.

import { fieldExample, fieldMatchKey, newFieldId, type Field } from './fields';

// A field as it arrives on the other block. Two marks do NOT survive the trip:
//
//   * the alias (`from`) — it names the upstream feeds of the block it was
//     written on, which are wrong on any other block;
//   * the generated `!` — the receiver didn't synthesize the value, it received
//     it, so it lands as an ordinary required field (exactly what a generated
//     field already looks like to everything downstream of its block).
//
// Type, collection-ness, optionality and the example copy verbatim. Nameless
// fields (an editor row toggled open but never typed into) are dropped — there
// is nothing to carry. Fresh ids: an id is a per-session edit key, never
// identity.
export function projectForTransfer(fields: Field[]): Field[] {
  return fields
    .filter((field) => field.name.length > 0)
    .map((field) => {
      const copy: Field = { id: newFieldId(), name: field.name, type: field.type };
      if (field.type === 'custom') copy.customType = field.customType ?? '';
      if (field.collection) copy.collection = true;
      if (field.optional) copy.optional = true;
      const example = fieldExample(field);
      if (example) copy.example = example;
      return copy;
    });
}

// Copy: the receiver keeps everything it has, and incoming fields whose name it
// doesn't already carry are appended — matched by fieldMatchKey (name only,
// the same identity the completeness check uses). On a name both sides carry,
// the receiver's version wins untouched: a copy adds what's missing, it doesn't
// edit what's there.
export function mergeFields(receiver: Field[], incoming: Field[]): Field[] {
  const have = new Set(receiver.map(fieldMatchKey));
  return [...receiver, ...incoming.filter((field) => !have.has(fieldMatchKey(field)))];
}
