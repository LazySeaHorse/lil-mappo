import { useProjectStore } from '@/store/useProjectStore';
import { AgentToolRegistrar } from './AgentToolRegistrar';
import { useAgentActionVisuals } from './useAgentActionVisuals';
import { AiPanel } from './AiPanel';
import { AiStatusPill } from './AiStatusPill';

/** Non-visual AI plumbing: tool registration and live action visuals. Stays mounted in zen mode. */
export function AiRuntime() {
  useAgentActionVisuals();
  return <AgentToolRegistrar />;
}

/** AI chrome (panel + status pill). Mount inside the floating UI layer so hide-UI hides it. */
export function AiOverlays() {
  const isExporting = useProjectStore((s) => s.isExporting);
  if (isExporting) return null;
  return (
    <>
      <AiPanel />
      <AiStatusPill />
    </>
  );
}
