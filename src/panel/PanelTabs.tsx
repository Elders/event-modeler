// The panel's top-level tab bar: one tab per logically distinct tool group.
// AI generation lives in its own tab, separate from the manual modeling
// palette, so the two ways of building a model don't crowd each other.

import './PanelTabs.css';

export type PanelTabId = 'build' | 'properties' | 'generate' | 'console';

const TABS: { id: PanelTabId; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'properties', label: 'Properties' },
  { id: 'generate', label: 'Generate' },
  { id: 'console', label: 'Console' },
];

const INDICATOR_LABEL: Record<Indicator, string> = {
  error: 'errors recorded',
  warn: 'warnings recorded',
};

// A tab with something worth noticing, and how urgent it is. Only Console uses
// this today; keyed by tab so the bar stays the one place that knows how to
// draw it.
export type Indicator = 'error' | 'warn';

export function PanelTabs({
  active,
  onChange,
  indicators,
}: {
  active: PanelTabId;
  onChange: (id: PanelTabId) => void;
  indicators?: Partial<Record<PanelTabId, Indicator>>;
}) {
  return (
    <div className="panel-tabs" role="tablist">
      {TABS.map((tab) => {
        const indicator = indicators?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`em-tab-${tab.id}`}
            aria-controls="em-tabpanel"
            aria-selected={active === tab.id}
            // The dot is decorative, so the fact it conveys goes in the name —
            // colour on a 6px circle is not something to rely on alone.
            aria-label={indicator ? `${tab.label} — ${INDICATOR_LABEL[indicator]}` : undefined}
            className={`panel-tab${active === tab.id ? ' panel-tab-active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {indicator && <span className={`panel-tab-dot panel-tab-dot-${indicator}`} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
