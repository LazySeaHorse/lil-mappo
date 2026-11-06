import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentEvents, useAgentStore } from '@/agent';
import { AgentToolRegistrar } from '@/components/AI/AgentToolRegistrar';
import { AiPanel } from '@/components/AI/AiPanel';
import { AiStatusPill } from '@/components/AI/AiStatusPill';
import { AiToolbarButton } from '@/components/AI/AiToolbarButton';
import TimelinePanel from '@/components/Timeline/TimelinePanel';
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
import { PHONE_WIDTH, setViewportWidth } from '../testViewport';
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
const settings: DemoRunSettings = { timing: DEFAULT_TIMING, speed: 1000, mockAi: true, aiPrompt: 'Show me a trip around France', autoZoom: false, maxZoom: 1.8, fullScreen: false, terminalShare: 0.25 };

/** The editor's AI parts, as the app mounts them, with the timeline and zen mode's switch and transport. */
function Editor() {
  useAgentActionVisuals();
  const hideUI = useProjectStore((s) => s.hideUI);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  return (
    <div>
      <div className={hideUI ? 'invisible' : 'visible'}>
        <button title="Hide UI" onClick={() => useProjectStore.getState().setHideUI(true)} />
        <AiToolbarButton />
        <AiPanel />
        <AiStatusPill />
        <TimelinePanel />
      </div>
      {hideUI && (
        <>
          <button title={isPlaying ? 'Pause' : 'Play'} onClick={() => useProjectStore.getState().setIsPlaying(!isPlaying)} />
          <button title="Show UI" onClick={() => useProjectStore.getState().setHideUI(false)} />
        </>
      )}
      <AgentToolRegistrar />
    </div>
  );
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

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

    // The panel is open only for a stretch of the run, and a poll can miss it when the machine is busy:
    // watch the stores for the moments instead.
    const seen = { panelOpenWhileOn: false, panelOpenWhileConnected: false };
    const watch = () => {
      const { open, bridgeStatus } = useAiPanelStore.getState();
      const enabled = useAgentStore.getState().enabled;
      seen.panelOpenWhileOn ||= open && enabled;
      seen.panelOpenWhileConnected ||= open && enabled && bridgeStatus === 'connected';
    };
    const stops = [useAiPanelStore.subscribe(watch), useAgentStore.subscribe(watch)];

    const run = mode.run(ctx, file, settings);
    // The panel closes once the connection shows, and the cursor leaves the map to the pill: wait for the end state.
    await vi.waitFor(() => expect(ctx.cursor.hidden).toBe(true));
    stops.forEach((stop) => stop());
    expect(seen).toEqual({ panelOpenWhileOn: true, panelOpenWhileConnected: true });
    expect(useAiPanelStore.getState()).toMatchObject({ open: false, bridgeStatus: 'connected' });
    expect(useAgentStore.getState().enabled).toBe(true);
    await vi.waitFor(() => expect(document.querySelector('[data-testid="ai-status-pill"]')).not.toBeNull());
    await vi.waitFor(() => expect(sent.find((m) => m.type === 'ai-panel')).toEqual({ type: 'ai-panel', open: true }));
    await run;
  });

  it('switches AI on without a button on the phone, whose toolbar has no AI panel', async () => {
    const restoreViewport = setViewportWidth(PHONE_WIDTH);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const ctx = testContext();
      // The phone's toolbar leaves the AI button out.
      render(<><AgentToolRegistrar /><TimelinePanel /></>);
      const { mode } = setup();
      let panelOpened = false;
      const unsubscribe = useAiPanelStore.subscribe((s) => {
        panelOpened ||= s.open;
      });

      const run = mode.run(ctx, file, settings);
      await vi.waitFor(() => expect(useAiPanelStore.getState().bridgeStatus).toBe('connected'));
      expect(useAgentStore.getState().enabled).toBe(true);
      await run;
      unsubscribe();

      expect(panelOpened).toBe(false);
      expect(warn).not.toHaveBeenCalled();
      expect(pickProject(useProjectStore.getState())).toEqual(pickProject(file));
    } finally {
      warn.mockRestore();
      restoreViewport();
    }
  });

  it('builds the project through the tools: it ends equal to the file, as the AI’s writes', async () => {
    const ctx = testContext(200);
    render(<Editor />);
    const { mode, aiEvents, sent } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // How many transcript events had been sent when playback started, and whether zen mode was on.
    const playedAfter: Array<[number, boolean]> = [];
    const stopWatching = useProjectStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying) playedAfter.push([aiEvents().length, state.hideUI]);
    });

    await mode.run(ctx, file, settings);
    stopWatching();

    // Once the agent has said done, the cursor goes into zen mode and plays; the editor is back when it ends.
    expect(playedAfter).toEqual([[aiEvents().length, true]]);
    expect(useProjectStore.getState().isPlaying).toBe(false);
    expect(useProjectStore.getState().hideUI).toBe(false);

    const project = pickProject(useProjectStore.getState());
    expect(project).toEqual(pickProject(file));

    // The terminal opens first, then the prompt is sent, then a thinking beat, then the work.
    const order = sent.map((m) => (m.type === 'ai-event' ? m.event.kind : m.type));
    expect(order.slice(0, 4)).toEqual(['ai-panel', 'user', 'thinking', 'text']);
    expect(aiEvents()[0]).toEqual({ kind: 'user', text: 'Show me a trip around France' });
    // The agent's last call (playhead to the start) comes before the closing summary, and the turn ends on it:
    // nothing but `done` follows, so the terminal goes idle while the cursor plays the project.
    const kinds = aiEvents().map((e) => e.kind);
    expect(kinds.slice(-4)).toEqual(['tool-start', 'tool-end', 'text', 'done']);
    expect(aiEvents().at(-3)).toMatchObject({ kind: 'tool-end', summary: expect.stringContaining('Playhead') });
    expect(aiEvents().at(-2)).toMatchObject({ kind: 'text', text: expect.stringContaining("ready to play") });
    expect(kinds.filter((k) => k === 'done')).toHaveLength(1);

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
