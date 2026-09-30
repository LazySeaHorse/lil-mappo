import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles, Undo2 } from 'lucide-react';
import { agentEvents, getAgentTools, selectAgentCalls, useAgentEvents, type AgentEvent } from '@/agent';
import { Button } from '@/components/ui/button';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { undo, useHistoryEntries } from '@/store/history';
import { formatRelativeTime } from './aiUtils';
import { useAiPanelStore } from './useAiPanelStore';

function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** A deliberate click on a feed row: select and open the inspector for what the call touched. */
function selectCallTargets(call: AgentEvent): void {
  const s = useProjectStore.getState();
  const camera = s.items[CAMERA_TRACK_ID];
  const kfId = call.affectedKeyframeIds?.find(
    (id) => camera?.kind === 'camera' && camera.keyframes.some((k) => k.id === id),
  );
  if (kfId) {
    s.selectItem(CAMERA_TRACK_ID);
    useProjectStore.getState().selectKeyframe(kfId);
    return;
  }
  const id = (call.affectedItemIds ?? []).find((i) => i !== CAMERA_TRACK_ID && s.items[i])
    ?? (call.affectedItemIds ?? []).find((i) => s.items[i]);
  if (id) s.selectItem(id);
}

function StatusIcon({ phase }: { phase: AgentEvent['phase'] }) {
  if (phase === 'started') return <Loader2 size={14} className="animate-spin text-primary" aria-label="Running" />;
  if (phase === 'succeeded') return <Check size={14} className="text-emerald-500" aria-label="Done" />;
  return <AlertCircle size={14} className="text-destructive" aria-label="Failed" />;
}

export function ActivityTab() {
  // Raw log is a stable reference; a selector that builds a new array each call would loop under zustand v5.
  const events = useAgentEvents();
  const { past } = useHistoryEntries();
  const now = useNow();
  const titles = useMemo(() => new Map(getAgentTools().map((t) => [t.name, t.title])), []);
  const canUndoAi = past.at(-1)?.source === 'ai';
  const newestFirst = useMemo(() => selectAgentCalls(events).reverse(), [events]);
  const openTab = useAiPanelStore((s) => s.setTab);

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {newestFirst.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
            <Sparkles size={18} />
            <p>No AI activity yet.</p>
            <p>
              Turn on AI control in the{' '}
              <button type="button" className="underline hover:text-foreground" onClick={() => openTab('connect')}>Connect tab</button>
              , then ask an agent in your browser to work on this project. Its actions will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40" data-testid="ai-feed">
            {newestFirst.map((call) => {
              const clickable = !!(call.affectedItemIds?.length || call.affectedKeyframeIds?.length);
              const title = titles.get(call.tool) ?? call.tool;
              const detail = call.phase === 'failed' ? call.error : call.summary;
              const body = (
                <>
                  <span className="mt-0.5 shrink-0"><StatusIcon phase={call.phase} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium truncate">{title}</span>
                    {detail && (
                      <span className={`block text-[11px] leading-snug ${call.phase === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{detail}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(call.at, now)}</span>
                </>
              );
              return (
                <li key={call.id}>
                  {clickable ? (
                    <button type="button" data-testid={`ai-row-${call.id}`} onClick={() => selectCallTargets(call)} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-secondary/50">
                      {body}
                    </button>
                  ) : (
                    <div data-testid={`ai-row-${call.id}`} className="flex items-start gap-2 px-4 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/40 p-3 shrink-0">
        <Button variant="secondary" size="sm" className="h-8 text-xs gap-1.5" disabled={!canUndoAi} onClick={() => undo()}>
          <Undo2 size={13} /> Undo last AI change
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={newestFirst.length === 0} onClick={() => agentEvents.clear()}>
          Clear feed
        </Button>
      </div>
    </div>
  );
}
