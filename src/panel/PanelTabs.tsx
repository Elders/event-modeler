// The panel's top-level tab bar: one tab per logically distinct tool group.
// AI generation lives in its own tab, separate from the manual modeling
// palette, so the two ways of building a model don't crowd each other.

import './PanelTabs.css';

export type PanelTabId = 'build' | 'fields' | 'generate' | 'console';

const TABS: { id: PanelTabId; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'fields', label: 'Fields' },
  { id: 'generate', label: 'Generate' },
  { id: 'console', label: 'Console' },
];

export function PanelTabs({
  active,
  onChange,
}: {
  active: PanelTabId;
  onChange: (id: PanelTabId) => void;
}) {
  return (
    <div className="panel-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={`panel-tab${active === tab.id ? ' panel-tab-active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
