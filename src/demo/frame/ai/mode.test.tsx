import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentEvents, useAgentStore } from '@/agent';
import { AgentToolRegistrar } from '@/components/AI/AgentToolRegistrar';
import { AiPanel } from '@/components/AI/AiPanel';
import { AiStatusPill } from '@/components/AI/AiStatusPill';
import { AiToolbarButton } from '@/components/AI/AiToolbarButton';
import { useAgentActionVisuals } from '@/components/AI/useAgentActionVisuals';
import { useAiPanelStore } from '@/components/AI/useAiPanelStore';
import { PRO, setSignedIn } from '@/components/AI/testUtils';
import { clearHistory, getHistoryEntries, installGestureTracking } from '@/store/history';
import { pickProject } from '@/store/projectDocument';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { DEFAULT_TIMING, type DemoRunSettings, type FrameToShell } from '../../protocol';
import { clearMocks, installFetchMocks } from '../mocks';
import { startingProject } from '../startState';
import { testContext } from '../testContext';
import { demoFixture } from '../testFixture';
import { AiMode } from './mode';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: PRO }) }));
vi.mock('react-secure-storage', () => ({ default: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }));
// The demo frame never dials the bridge; neither does the test.
vi.mock('@/agent/bridge', async (importActual) => ({
  ...(await importActual<typeof import('@/agent/bridge')>()),
  connectBridge: () => () => {},
}));
// The fixture's .glb is not in memory; the run is for a session that has it.
vi.mock('@/models/modelRegistry', async (importActual) => ({
  ...(await importActual<typeof import('@/models/modelRegistry')>()),
  isModelReady: () => true,
}));

const file = demoFixture();
const settings: DemoRunSettings = { timing: DEFAULT_TIMING, speed: 1000, mockAi: true, aiPrompt: 'Show me a trip around France' };

/** The editor's AI parts, as the app mounts them. */
function Editor() {
  useAgentActionVisuals();
  return (
    <div>
      <AiToolbarButton />
      <AiPanel />
      <AiStatusPill />
      <AgentToolRegistrar />
    </div>
  );
}

let stopGestures: () => void;
let uninstallMocks: () => void;
let stopAutoPause: () => void;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  uninstallMocks = installFetchMocks();
  stopGestures = installGestureTracking();
  useProjectStore.setState({ ...startingProject(file), ...createTransientState() });
  clearHistory();
  agentEvents.clear();
  useAgentStore.setState({ enabled: false, exportLimits: null, paidPlan: false });
  useAiPanelStore.setState({ open: false, tab: 'connect', followAi: true, registeredCount: 0, bridgeStatus: 'off', guideOffered: false, guideOpen: false });
  setSignedIn(true);
  localStorage.setItem('lilmappo.ai.consent.v1', '1');
  // No playback loop in the test: playing ends a moment after it starts.
  stopAutoPause = useProjectStore.subscribe((state, prev) => {
    if (state.isPlaying && !prev.isPlaying) setTimeout(() => useProjectStore.getState().setIsPlaying(false), 40);
  });
});

afterEach(() => {
  cleanup();
  stopAutoPause();
  stopGestures();
  uninstallMocks();
  clearMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const sent: FrameToShell[] = [];
  const mode = new AiMode((msg) => sent.push(msg));
  const aiEvents = () => sent.flatMap((m) => (m.type === 'ai-event' ? [m.event] : []));
  return { sent, mode, aiEvents };
}

describe('AiMode', () => {
  it('switches AI on through the panel, shows a live connection, then closes the panel for the map', async () => {
    const ctx = testContext();
    render(<Editor />);
    const { mode, sent } = setup();
    ctx.cursor.setHidden(false);

    const run = mode.run(ctx, file, settings);
    // Midway: the panel is open and AI is on, the bridge dialling or connected.
    await vi.waitFor(() => expect(useAiPanelStore.getState().open).toBe(true));
    await vi.waitFor(() => expect(useAgentStore.getState().enabled).toBe(true));
    await vi.waitFor(() => expect(useAiPanelStore.getState().bridgeStatus).toBe('connected'));
    await vi.waitFor(() => expect(useAiPanelStore.getState().open).toBe(false));
    await vi.waitFor(() => expect(document.querySelector('[data-testid="ai-status-pill"]')).not.toBeNull());
    expect(ctx.cursor.hidden).toBe(true);
    expect(sent.find((m) => m.type === 'ai-panel')).toEqual({ type: 'ai-panel', open: true });
    await run;
  });

  it('builds the project through the tools: it ends equal to the file, as the AI’s writes', async () => {
    const ctx = testContext(200);
    render(<Editor />);
    const { mode, aiEvents, sent } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mode.run(ctx, file, settings);

    const project = pickProject(useProjectStore.getState());
    expect(project).toEqual(pickProject(file));

    // The terminal opens first, then the prompt is sent, then a thinking beat, then the work.
    const order = sent.map((m) => (m.type === 'ai-event' ? m.event.kind : m.type));
    expect(order.slice(0, 4)).toEqual(['ai-panel', 'user', 'thinking', 'text']);
    expect(aiEvents()[0]).toEqual({ kind: 'user', text: 'Show me a trip around France' });
    // The turn ends with the closing summary; the playback call follows it.
    const kinds = aiEvents().map((e) => e.kind);
    expect(kinds.indexOf('done')).toBeGreaterThan(kinds.lastIndexOf('text') - 1);
    expect(aiEvents().at(-1)).toMatchObject({ kind: 'tool-end', summary: expect.stringContaining('Playhead') });

    // Every call is started then ended, in pairs, and succeeded.
    const starts = aiEvents().filter((e) => e.kind === 'tool-start');
    const ends = aiEvents().filter((e) => e.kind === 'tool-end');
    expect(ends.map((e) => (e.kind === 'tool-end' ? e.id : ''))).toEqual(starts.map((e) => (e.kind === 'tool-start' ? e.id : '')));
    expect(ends.filter((e) => e.kind === 'tool-end' && !e.ok)).toEqual([]);
    expect(starts.map((e) => (e.kind === 'tool-start' ? e.name : ''))).toEqual(
      expect.arrayContaining(['get_guide', 'add_boundary', 'add_route', 'add_callout', 'add_camera_keyframe', 'update_project_settings', 'set_playhead']),
    );
    expect(ends.find((e) => e.kind === 'tool-end' && /Added boundary "Spain"/.test(e.summary))).toBeDefined();
    expect(warn).not.toHaveBeenCalled();

    // The app's AI feedback (select and pulse the item, follow the map) runs off these events, so each add names what it made.
    const succeeded = agentEvents.getLog().filter((e) => e.phase === 'succeeded');
    expect(succeeded).toHaveLength(starts.length);
    for (const tool of ['add_boundary', 'add_route', 'add_callout']) {
      expect(succeeded.filter((e) => e.tool === tool).every((e) => e.affectedItemIds?.length === 1)).toBe(true);
    }
    expect(succeeded.filter((e) => e.tool === 'add_camera_keyframe').every((e) => e.affectedKeyframeIds?.length === 1)).toBe(true);

    // History: every step is the AI's, except the model the user placed.
    const sources = getHistoryEntries().past.map((e) => e.source);
    expect(sources.filter((s) => s === 'user')).toHaveLength(1);
    expect(sources.filter((s) => s === 'ai').length).toBeGreaterThan(8);
    expect(useAiPanelStore.getState().followAi).toBe(true);
    warn.mockRestore();
  });

  it('tears down: AI off, panel closed, bridge off, terminal away', async () => {
    const ctx = testContext();
    render(<Editor />);
    const { mode, sent } = setup();
    await mode.run(ctx, file, settings);
    expect(useAgentStore.getState().enabled).toBe(true);

    mode.teardown();
    expect(useAgentStore.getState().enabled).toBe(false);
    expect(useAiPanelStore.getState()).toMatchObject({ open: false, bridgeStatus: 'off' });
    expect(agentEvents.getLog()).toEqual([]);
    expect(sent.at(-1)).toEqual({ type: 'ai-panel', open: false });
    // A second teardown (nothing running) says nothing more.
    const count = sent.length;
    mode.teardown();
    expect(sent).toHaveLength(count);
  });

  it('stops where it is when the run is cancelled', async () => {
    const ctx = testContext(50);
    render(<Editor />);
    const { mode, aiEvents } = setup();
    const run = mode.run(ctx, file, settings);
    await vi.waitFor(() => expect(aiEvents().some((e) => e.kind === 'tool-start')).toBe(true));
    ctx.clock.cancel();
    await expect(run).rejects.toMatchObject({ name: 'DemoAborted' });
    expect(aiEvents().at(-1)?.kind).not.toBe('done');
  });
});
