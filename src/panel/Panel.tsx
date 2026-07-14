// The panel: a tab bar over the tool groups, plus the shared busy guard. The
// manual modeling palette lives under "Build"; AI generation has its own tab.

import './Panel.css';
import { useState } from 'react';
import { BuildingBlocksSection } from './BuildingBlocksSection';
import { ConvertSection } from './ConvertSection';
import { FieldsSection } from './FieldsSection';
import { GenerateSection } from './GenerateSection';
import { PanelTabs, type PanelTabId } from './PanelTabs';
import { PatternsSection } from './PatternsSection';
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
            <BuildingBlocksSection busy={busy} guard={guard} />
            <PatternsSection busy={busy} guard={guard} />
            <ConvertSection busy={busy} guard={guard} />
          </>
        ) : tab === 'fields' ? (
          <FieldsSection />
        ) : (
          <GenerateSection busy={busy} guard={guard} />
        )}
      </div>
    </div>
  );
}
