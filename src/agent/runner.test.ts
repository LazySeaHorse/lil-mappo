import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { getAgentTools, runAgentTool } from './runner';
import { agentEvents, selectAgentCalls, AGENT_EVENT_LOG_LIMIT } from './events';
import { useAgentStore } from './store';
import { resetAgentTestState, resultJson } from './testHelpers';

describe('runAgentTool', () => {
  beforeEach(resetAgentTestState);

  it('returns structured, agent-readable errors for invalid input and never throws', async () => {
    const result = await runAgentTool('set_playhead', { time: 'soon' });
    expect(result.isError).toBe(true);
    const body = resultJson<{ error: string; issues: { path: string; message: string }[] }>(result);
    expect(body.error).toBe('invalid_input');
    expect(body.issues[0].path).toBe('time');
    expect(typeof body.issues[0].message).toBe('string');
  });

  it('reports unknown tools with the available names', async () => {
    const result = await runAgentTool('nope', {});
    const body = resultJson<{ error: string; availableTools: string[] }>(result);
    expect(body.error).toBe('unknown_tool');
    expect(body.availableTools).toContain('set_playhead');
  });

  it('refuses every call while the agent layer is disabled', async () => {
    useAgentStore.getState().setEnabled(false);
    const result = await runAgentTool('set_playhead', { time: 1 });
    expect(result.isError).toBe(true);
    expect(resultJson(result).error).toBe('agent_disabled');
    expect(useProjectStore.getState().playheadTime).toBe(0);
  });

  it('refuses write tools while exporting but allows read-only tools', async () => {
    useProjectStore.setState({ isExporting: true });
    const write = await runAgentTool('set_playhead', { time: 1 });
    expect(resultJson(write).error).toBe('export_in_progress');
  });

  it('runs a tool, returns MCP-style text content, and emits started then succeeded', async () => {
    const seen: string[] = [];
    const off = agentEvents.subscribe((e) => seen.push(`${e.tool}:${e.phase}`));
    const result = await runAgentTool('set_playhead', { time: 2.5 });
    off();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe('text');
    expect(resultJson(result).playheadTime).toBe(2.5);
    expect(useProjectStore.getState().playheadTime).toBe(2.5);
    expect(seen).toEqual(['set_playhead:started', 'set_playhead:succeeded']);
    const [call] = selectAgentCalls(agentEvents.getLog());
    expect(call.phase).toBe('succeeded');
    expect(call.summary).toContain('2.5');
  });

  it('emits started then failed with an error message for handler failures', async () => {
    const result = await runAgentTool('set_playhead', { time: 999 });
    expect(result.isError).toBe(true);
    const log = agentEvents.getLog();
    expect(log.map((e) => e.phase)).toEqual(['started', 'failed']);
    expect(log[1].error).toContain('duration');
    expect(log[0].id).toBe(log[1].id);
  });

  it('keeps a bounded log', () => {
    for (let i = 0; i < AGENT_EVENT_LOG_LIMIT + 25; i++) {
      agentEvents.emit({ id: String(i), tool: 't', phase: 'started', input: {}, at: i });
    }
    expect(agentEvents.getLog()).toHaveLength(AGENT_EVENT_LOG_LIMIT);
    expect(agentEvents.getLog()[0].id).toBe('25');
  });
});

describe('getAgentTools', () => {
  it('exposes JSON Schema object inputs, annotations and an execute function', async () => {
    const tools = getAgentTools();
    expect(tools.length).toBeGreaterThan(0);
    const names = new Set<string>();
    for (const tool of tools) {
      expect(names.has(tool.name)).toBe(false);
      names.add(tool.name);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.$schema).toBeUndefined();
      expect(tool.description.length).toBeGreaterThan(40);
      expect(typeof tool.annotations.readOnlyHint).toBe('boolean');
      expect(() => JSON.stringify(tool.inputSchema)).not.toThrow();
    }
    resetAgentTestState();
    const setPlayhead = tools.find((t) => t.name === 'set_playhead')!;
    expect((await setPlayhead.execute({ time: 1 })).isError).toBeUndefined();
  });
});

describe('undo / redo tools', () => {
  beforeEach(resetAgentTestState);

  it('undo reverts the last step and reports its label; redo re-applies it', async () => {
    await runAgentTool('add_camera_keyframe', { time: 3, center: [0, 0], zoom: 4 });
    const undone = resultJson<{ reverted: { label: string; source: string }; canRedo: boolean }>(await runAgentTool('undo', {}));
    expect(undone.reverted).toEqual({ label: 'AI: add camera keyframe at 3s', source: 'ai' });
    expect(undone.canRedo).toBe(true);
    const cam = useProjectStore.getState().items['camera-track'];
    expect(cam.kind === 'camera' && cam.keyframes).toHaveLength(0);

    const redone = resultJson<{ reapplied: { label: string } }>(await runAgentTool('redo', {}));
    expect(redone.reapplied.label).toBe('AI: add camera keyframe at 3s');
    expect(resultJson(await runAgentTool('redo', {})).error).toBe('nothing_to_redo');
  });

  it('undo with an empty history is a structured error', async () => {
    const result = await runAgentTool('undo', {});
    expect(result.isError).toBe(true);
    expect(resultJson(result).error).toBe('nothing_to_undo');
  });
});
