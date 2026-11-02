import { useMemo } from 'react';
import { selectAgentCalls, useAgentEvents } from '@/agent';
import { useResponsive } from '@/hooks/useResponsive';
import { belowToolbarTop } from '@/constants/layout';
import { useAiPanelStore } from './useAiPanelStore';
import { MapPill } from '@/components/MapStatusPills/MapPill';

/** Visible only while tools are registered with the browser or linked to the bridge. Opens the panel on Activity. */
export function AiStatusPill() {
  const registered = useAiPanelStore((s) => s.registeredCount);
  const bridged = useAiPanelStore((s) => s.bridgeStatus === 'connected');
  const open = useAiPanelStore((s) => s.open);
  const openPanel = useAiPanelStore((s) => s.openPanel);
  const { isMobile } = useResponsive();
  const events = useAgentEvents();
  const { calls, running } = useMemo(() => {
    const all = selectAgentCalls(events);
    return { calls: all.length, running: all.some((c) => c.phase === 'started') };
  }, [events]);

  if ((registered === 0 && !bridged) || open) return null;

  return (
    <div className="absolute left-1/2 z-40 -translate-x-1/2" style={{ top: belowToolbarTop(isMobile) }}>
      <MapPill
        testId="ai-status-pill"
        leading={(
          <span
            data-testid="ai-status-dot"
            data-running={running}
            className={`size-2 shrink-0 rounded-full bg-success ${running ? 'agent-dot-active' : ''}`}
          />
        )}
        title="Open AI activity"
        onClick={() => openPanel('activity')}
      >
        AI connected <span className="ml-1 text-muted-foreground">{calls} {calls === 1 ? 'call' : 'calls'}</span>
      </MapPill>
    </div>
  );
}
