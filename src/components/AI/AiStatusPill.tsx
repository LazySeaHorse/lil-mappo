import { useMemo } from 'react';
import { selectAgentCalls, useAgentEvents } from '@/agent';
import { useResponsive } from '@/hooks/useResponsive';
import { belowToolbarTop } from './aiUtils';
import { useAiPanelStore } from './useAiPanelStore';

/** Visible only while tools are registered with the browser. Opens the panel on Activity. */
export function AiStatusPill() {
  const registered = useAiPanelStore((s) => s.registeredCount);
  const open = useAiPanelStore((s) => s.open);
  const openPanel = useAiPanelStore((s) => s.openPanel);
  const { isMobile } = useResponsive();
  const events = useAgentEvents();
  const { calls, running } = useMemo(() => {
    const all = selectAgentCalls(events);
    return { calls: all.length, running: all.some((c) => c.phase === 'started') };
  }, [events]);

  if (registered === 0 || open) return null;

  return (
    <button
      type="button"
      data-testid="ai-status-pill"
      onClick={() => openPanel('activity')}
      className="absolute left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-border/50 bg-background/85 px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur-xl pointer-events-auto hover:bg-background"
      style={{ top: belowToolbarTop(isMobile) }}
    >
      <span
        data-testid="ai-status-dot"
        data-running={running}
        className={`h-2 w-2 rounded-full bg-emerald-500 ${running ? 'agent-dot-active' : ''}`}
      />
      <span>AI connected</span>
      <span className="text-muted-foreground">{calls} {calls === 1 ? 'call' : 'calls'}</span>
    </button>
  );
}
