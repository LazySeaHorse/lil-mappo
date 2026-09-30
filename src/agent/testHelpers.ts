import { useProjectStore, createTransientState } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { clearHistory, getHistoryEntries } from '@/store/history';
import { agentEvents } from './events';
import { useAgentStore } from './store';
import { setAgentMapRef, setAgentRuntimeRef } from './mapRef';
import type { AgentToolResult } from './defineTool';

/** Resets the project store, history, agent switches, events and map refs for a test. */
export function resetAgentTestState(): void {
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
  clearHistory();
  agentEvents.clear();
  useAgentStore.setState({ enabled: true, exportLimits: null });
  setAgentMapRef(null);
  setAgentRuntimeRef(null);
}

export function resultText(result: AgentToolResult): string {
  const first = result.content[0];
  return first.type === 'text' ? first.text : '';
}

/** Parses the JSON text payload of a result. */
export function resultJson<T = Record<string, unknown>>(result: AgentToolResult): T {
  return JSON.parse(resultText(result)) as T;
}

export function historyPast() {
  return getHistoryEntries().past;
}
