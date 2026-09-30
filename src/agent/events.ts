import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type AgentEventPhase = 'started' | 'succeeded' | 'failed';

export interface AgentEvent {
  /** Shared by the started and succeeded/failed events of one call. */
  id: string;
  tool: string;
  phase: AgentEventPhase;
  input: unknown;
  /** One-line human-readable outcome (succeeded only). */
  summary?: string;
  /** Error message (failed only). */
  error?: string;
  /** Timeline items (including the camera track id) the call created or changed. */
  affectedItemIds?: string[];
  /** Camera keyframes the call created or changed. */
  affectedKeyframeIds?: string[];
  /** Epoch ms. */
  at: number;
}

export const AGENT_EVENT_LOG_LIMIT = 200;

type Listener = (event: AgentEvent) => void;

const listeners = new Set<Listener>();

/** Bounded in-memory log, oldest first. Every phase of every call is an entry. */
const logStore = createStore<{ events: AgentEvent[] }>(() => ({ events: [] }));

export const agentEvents = {
  emit(event: AgentEvent): void {
    logStore.setState((s) => ({ events: [...s.events, event].slice(-AGENT_EVENT_LOG_LIMIT) }));
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (err) {
        console.error('[agent] event listener failed', err);
      }
    }
  },
  /** Subscribes to future events. Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Snapshot of the log, oldest first (last AGENT_EVENT_LOG_LIMIT events). */
  getLog(): readonly AgentEvent[] {
    return logStore.getState().events;
  },
  clear(): void {
    logStore.setState({ events: [] });
  },
};

/** Reactive log for an activity feed. Pass a selector to narrow re-renders. */
export function useAgentEvents<T = readonly AgentEvent[]>(
  selector: (events: readonly AgentEvent[]) => T = (e) => e as unknown as T,
): T {
  return useStore(logStore, (s) => selector(s.events));
}

/** One entry per call (its latest phase), oldest call first. */
export function selectAgentCalls(events: readonly AgentEvent[]): AgentEvent[] {
  const latest = new Map<string, AgentEvent>();
  for (const e of events) latest.set(e.id, e);
  return [...latest.values()];
}
