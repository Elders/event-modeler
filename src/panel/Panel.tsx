// The panel: a tab bar over the tool groups, plus the shared busy guard. The
// manual modeling palette lives under "Build"; AI generation has its own tab.

import './Panel.css';
import { useState } from 'react';
import { BuildingBlocksSection } from './BuildingBlocksSection';
import { GenerateSection } from './GenerateSection';
import { PanelTabs, type PanelTabId } from './PanelTabs';
import { PatternsSection } from './PatternsSection';
import { ScreensSection } from './ScreensSection';
import { SpecificationsSection } from './SpecificationsSection';
import { SwimlanesSection } from './SwimlanesSection';
import { useBusyGuard } from './useBusyGuard';

export function Panel() {
  const { busy, guard } = useBusyGuard();
  const [tab, setTab] = useState<PanelTabId>('build');

  return (
    <div className="panel">
      <PanelTabs active={tab} onChange={setTab} />
      <div className="tab-panel" role="tabpanel">
        {tab === 'build' ? (
          <>
            <BuildingBlocksSection guard={guard} />
            <ScreensSection busy={busy} guard={guard} />
            <PatternsSection busy={busy} guard={guard} />
            <SpecificationsSection busy={busy} guard={guard} />
            <SwimlanesSection busy={busy} guard={guard} />
          </>
        ) : (
          <GenerateSection busy={busy} guard={guard} />
        )}
      </div>
    </div>
  );
}
