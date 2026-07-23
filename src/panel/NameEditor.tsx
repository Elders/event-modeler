// The element-name input at the top of the Properties tab: one line, committed
// on blur (Enter blurs, Escape reverts and blurs). The input owns its value
// while focused so a board re-read can never clobber what the user is typing —
// the same rule the field inputs follow — and re-seeds from the prop otherwise,
// so a rename made on the board shows up here once it's re-read.

import './NameEditor.css';
import { useEffect, useRef, useState } from 'react';

export function NameEditor({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (next: string) => void;
}) {
  const [value, setValue] = useState(name);
  const [focused, setFocused] = useState(false);
  // Set by Escape so the blur it triggers discards the edit instead of
  // committing the state value (which may not have re-rendered yet).
  const reverting = useRef(false);

  useEffect(() => {
    if (!focused) setValue(name);
  }, [name, focused]);

  const commit = () => {
    setFocused(false);
    if (reverting.current) {
      reverting.current = false;
      setValue(name);
      return;
    }
    if (value !== name) onCommit(value);
  };

  return (
    <div className="name-editor">
      <input
        className="name-input"
        type="text"
        value={value}
        placeholder="Name"
        aria-label="Element name"
        onFocus={() => setFocused(true)}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            reverting.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
