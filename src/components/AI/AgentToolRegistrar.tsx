import { useEffect } from 'react';
import { getAgentTools, isWebMcpSupported, registerWebMcpTool, useAgentStore } from '@/agent';
import { getExportLimits } from '@/lib/cloudAccess';
import { useAiAccess } from './useAiAccess';
import { useAiPanelStore } from './useAiPanelStore';

/**
 * Registers the agent tools with the browser's WebMCP API while the user is
 * signed in, Pro and has switched AI control on. Renders nothing. Unmounting
 * or turning any condition off unregisters every tool.
 */
export function AgentToolRegistrar() {
  const { allowed, subscription } = useAiAccess();
  const enabled = useAgentStore((s) => s.enabled);
  const setEnabled = useAgentStore((s) => s.setEnabled);
  const setExportLimits = useAgentStore((s) => s.setExportLimits);
  const setRegisteredCount = useAiPanelStore((s) => s.setRegisteredCount);

  useEffect(() => {
    setExportLimits(getExportLimits(subscription));
  }, [subscription, setExportLimits]);

  // Losing access (sign out, plan lapse) also switches the runner off.
  useEffect(() => {
    if (!allowed && enabled) setEnabled(false);
  }, [allowed, enabled, setEnabled]);

  const active = allowed && enabled;
  useEffect(() => {
    if (!active || !isWebMcpSupported()) {
      setRegisteredCount(0);
      return;
    }
    const unregister = getAgentTools()
      .map((tool) => registerWebMcpTool(tool))
      .filter((off): off is () => void => off !== null);
    setRegisteredCount(unregister.length);
    return () => {
      unregister.forEach((off) => off());
      setRegisteredCount(0);
    };
  }, [active, setRegisteredCount]);

  return null;
}
