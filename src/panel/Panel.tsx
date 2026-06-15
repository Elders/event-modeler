// The panel: composes the section components and owns the shared busy guard.

import './Panel.css';
import { BuildingBlocksSection } from './BuildingBlocksSection';
import { GenerateSection } from './GenerateSection';
import { PatternsSection } from './PatternsSection';
import { ScreensSection } from './ScreensSection';
import { SpecificationsSection } from './SpecificationsSection';
import { SwimlanesSection } from './SwimlanesSection';
import { useBusyGuard } from './useBusyGuard';

export function Panel() {
  const { busy, guard } = useBusyGuard();

  return (
    <div className="panel">
      <GenerateSection busy={busy} guard={guard} />
      <BuildingBlocksSection guard={guard} />
      <ScreensSection busy={busy} guard={guard} />
      <PatternsSection busy={busy} guard={guard} />
      <SpecificationsSection busy={busy} guard={guard} />
      <SwimlanesSection busy={busy} guard={guard} />
    </div>
  );
}
