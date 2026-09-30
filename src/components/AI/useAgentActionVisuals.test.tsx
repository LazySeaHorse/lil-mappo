import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { agentEvents, setAgentMapRef } from '@/agent';
import { resetAgentTestState } from '@/agent/testHelpers';
import { useProjectStore, CAMERA_TRACK_ID } from '@/store/useProjectStore';
import { useAiPanelStore } from './useAiPanelStore';
import { useAgentActionVisuals, VISUAL_MIN_MS } from './useAgentActionVisuals';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from 'sonner';

const fitBounds = vi.fn();
const easeTo = vi.fn();

function installMap() {
  setAgentMapRef({
    current: {
      getMap: () => ({
        fitBounds,
        easeTo,
        getContainer: () => ({ getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
      }),
    },
  } as never);
}

const route = {
  kind: 'route', id: 'r1', name: 'R', startTime: 0, endTime: 5,
  geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] },
};

let n = 0;
function succeed(tool: string, extra: Record<string, unknown>) {
  const id = `e${n++}`;
  agentEvents.emit({ id, tool, phase: 'started', input: {}, at: Date.now() });
  agentEvents.emit({ id, tool, phase: 'succeeded', input: {}, at: Date.now(), ...extra });
  return id;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAgentTestState();
  useAiPanelStore.setState({ followAi: true });
  useProjectStore.setState({
    items: { ...useProjectStore.getState().items, r1: route as never },
    isInspectorOpen: false,
    isPlaying: false,
    selectedItemId: null,
  });
  installMap();
  fitBounds.mockClear();
  easeTo.mockClear();
  vi.mocked(toast.error).mockClear();
  document.body.innerHTML = '<div data-agent-item="r1"></div><button data-walkthrough="add-route"></button>';
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useAgentActionVisuals', () => {
  it('selects the item without opening a closed inspector, pulses, and fits the map', () => {
    renderHook(() => useAgentActionVisuals());
    succeed('add_route', { affectedItemIds: ['r1'] });
    vi.advanceTimersByTime(1);
    const s = useProjectStore.getState();
    expect(s.selectedItemId).toBe('r1');
    expect(s.isInspectorOpen).toBe(false);
    expect(document.querySelector('[data-agent-item="r1"]')!.classList.contains('agent-pulse')).toBe(true);
    expect(document.querySelector('[data-walkthrough="add-route"]')!.classList.contains('agent-pulse-ring')).toBe(true);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0][1]).toMatchObject({ duration: 800 });
  });

  it('respects the Follow AI toggle and isPlaying but still selects', () => {
    renderHook(() => useAgentActionVisuals());
    useAiPanelStore.setState({ followAi: false });
    succeed('add_route', { affectedItemIds: ['r1'] });
    vi.advanceTimersByTime(1);
    expect(useProjectStore.getState().selectedItemId).toBe('r1');
    expect(fitBounds).not.toHaveBeenCalled();

    useAiPanelStore.setState({ followAi: true });
    useProjectStore.setState({ isPlaying: true });
    vi.advanceTimersByTime(VISUAL_MIN_MS);
    succeed('update_item', { affectedItemIds: ['r1'] });
    vi.advanceTimersByTime(1);
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it('eases to a keyframe camera for camera tools', () => {
    const cam = useProjectStore.getState().items[CAMERA_TRACK_ID] as { keyframes: unknown[] };
    useProjectStore.setState({
      items: {
        ...useProjectStore.getState().items,
        [CAMERA_TRACK_ID]: { ...cam, keyframes: [{ id: 'k1', time: 0, camera: { center: [3, 4], zoom: 5, pitch: 10, bearing: 20 }, easing: 'linear' }] } as never,
      },
    });
    renderHook(() => useAgentActionVisuals());
    succeed('add_camera_keyframe', { affectedItemIds: [CAMERA_TRACK_ID], affectedKeyframeIds: ['k1'] });
    vi.advanceTimersByTime(1);
    expect(easeTo).toHaveBeenCalledWith({ center: [3, 4], zoom: 5, pitch: 10, bearing: 20, duration: 800 });
    expect(useProjectStore.getState().selectedKeyframeId).toBe('k1');
  });

  it('ignores read-only tools, render_frames and set_playhead, and pauses visuals during render_frames', () => {
    renderHook(() => useAgentActionVisuals());
    succeed('get_item', { affectedItemIds: ['r1'] });
    succeed('set_playhead', { affectedItemIds: ['r1'] });
    agentEvents.emit({ id: 'rf', tool: 'render_frames', phase: 'started', input: {}, at: 0 });
    succeed('update_item', { affectedItemIds: ['r1'] });
    agentEvents.emit({ id: 'rf', tool: 'render_frames', phase: 'succeeded', input: {}, at: 0 });
    vi.advanceTimersByTime(2000);
    expect(useProjectStore.getState().selectedItemId).toBeNull();
    expect(fitBounds).not.toHaveBeenCalled();
  });

  it('spaces bursts by the minimum interval and drops to the latest when flooded', () => {
    renderHook(() => useAgentActionVisuals());
    const ids = ['a', 'b', 'c'].map((id) => id);
    for (const id of ids) {
      useProjectStore.setState({ items: { ...useProjectStore.getState().items, [id]: { ...route, id } as never } });
    }
    for (const id of ids) succeed('update_item', { affectedItemIds: [id] });
    vi.advanceTimersByTime(1);
    expect(fitBounds).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(VISUAL_MIN_MS);
    expect(fitBounds).toHaveBeenCalledTimes(2);

    fitBounds.mockClear();
    vi.advanceTimersByTime(5000);
    for (let i = 0; i < 12; i++) succeed('update_item', { affectedItemIds: ['a'] });
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(VISUAL_MIN_MS * 10);
    // First runs immediately; the flood collapsed so far fewer than 12 ran.
    expect(fitBounds.mock.calls.length).toBeLessThan(8);
  });

  it('toasts failures of write tools only, rate limited', () => {
    renderHook(() => useAgentActionVisuals());
    const fail = (tool: string) => agentEvents.emit({ id: `f${n++}`, tool, phase: 'failed', input: {}, error: 'nope', at: Date.now() });
    fail('get_project');
    expect(toast.error).not.toHaveBeenCalled();
    fail('update_item');
    fail('update_item');
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
