import { useRef } from 'react';
import { AiPanel } from './AiPanel';
import { useProjectStore } from '@/store/useProjectStore';
import { AgentToolRegistrar } from './AgentToolRegistrar';
import { useAgentActionVisuals } from './useAgentActionVisuals';
import { useAiPanelStore } from './useAiPanelStore';
import { AiStatusPill } from './AiStatusPill';
import { BridgeGuideDialog } from './BridgeGuideDialog';

/** Non-visual AI plumbing: tool registration and live action visuals. Stays mounted in zen mode. */
export function AiRuntime() {
  useAgentActionVisuals();
  return <AgentToolRegistrar />;
}

/** AI chrome (panel + status pill). Mount inside the floating UI layer so hide-UI hides it. */
export function AiOverlays() {
  const isExporting = useProjectStore((s) => s.isExporting);
  // The panel UI loads the first time it is opened, then stays mounted.
  const open = useAiPanelStore((s) => s.open);
  const openedRef = useRef(false);
  if (open) openedRef.current = true;
  if (isExporting) return null;
  return (
    <>
      {openedRef.current && (
        <>
          <AiPanel />
          <BridgeGuideDialog />
        </>
      )}
      <AiStatusPill />
    </>
  );
}
