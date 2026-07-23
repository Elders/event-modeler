// The panel: a tab bar over the tool groups, plus the shared busy guard. The
// manual modeling palette lives under "Build"; AI generation has its own tab.

import './Panel.css';
import { useState } from 'react';
import { BuildingBlocksSection } from './BuildingBlocksSection';
import { ConsoleSection } from './ConsoleSection';
import { ConvertSection } from './ConvertSection';
import { FieldsSection } from './FieldsSection';
import { GenerateSection } from './GenerateSection';
import { PanelTabs, type PanelTabId } from './PanelTabs';
import { PatternsSection } from './PatternsSection';
import { useAutoFieldsTab } from './useAutoFieldsTab';
import { useBusyGuard } from './useBusyGuard';
import { useLogSummary } from './useLogSummary';

export function Panel() {
  const { busy, guard } = useBusyGuard();
  const [tab, setTab] = useState<PanelTabId>('build');
  // Selecting a field-bearing block or a single arrow on the board brings the
  // Fields tab forward on its own.
  useAutoFieldsTab(tab, setTab);
  // Mark the Console tab whenever anything has been recorded. The failures it
  // collects happen on the board page with the panel shut, so without this the
  // tab is only ever opened by someone who already suspects something.
  const logs = useLogSummary();

  return (
    <div className="panel">
      <PanelTabs
        active={tab}
        onChange={setTab}
        indicators={logs.worst ? { console: logs.worst } : undefined}
      />
      <div className="tab-panel" role="tabpanel">
        {tab === 'build' ? (
          <>
            <BuildingBlocksSection busy={busy} guard={guard} />
            <PatternsSection busy={busy} guard={guard} />
            <ConvertSection busy={busy} guard={guard} />
          </>
        ) : tab === 'fields' ? (
          <FieldsSection />
        ) : tab === 'generate' ? (
          <GenerateSection busy={busy} guard={guard} />
        ) : (
          <ConsoleSection />
        )}
      </div>
    </div>
  );
}
