import { useEffect } from 'react';
import { connectBridge, getAgentTools, isWebMcpSupported, registerWebMcpTool, useAgentStore } from '@/agent';
import { getExportLimits, isWanderer } from '@/lib/cloudAccess';
import { useAiAccess } from './useAiAccess';
import { useAiPanelStore } from './useAiPanelStore';

/**
 * Registers the agent tools with the browser's WebMCP API and links them to the
 * local bridge (for coding agents) while the user is signed in and has
 * switched AI control on. Renders nothing. Unmounting
 * or turning any condition off unregisters every tool.
 */
export function AgentToolRegistrar() {
  const { allowed, subscription } = useAiAccess();
  const enabled = useAgentStore((s) => s.enabled);
  const setEnabled = useAgentStore((s) => s.setEnabled);
  const setExportLimits = useAgentStore((s) => s.setExportLimits);
  const setPaidPlan = useAgentStore((s) => s.setPaidPlan);
  const setRegisteredCount = useAiPanelStore((s) => s.setRegisteredCount);
  const setBridgeStatus = useAiPanelStore((s) => s.setBridgeStatus);

  useEffect(() => {
    setExportLimits(getExportLimits(subscription));
    setPaidPlan(isWanderer(subscription));
  }, [subscription, setExportLimits, setPaidPlan]);

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

  useEffect(() => {
    if (!active) return;
    const disconnect = connectBridge(getAgentTools(), setBridgeStatus);
    return () => {
      disconnect();
      setBridgeStatus('off');
    };
  }, [active, setBridgeStatus]);

  return null;
}
