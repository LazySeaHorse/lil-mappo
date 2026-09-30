import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';

const applyCamera = vi.fn();
vi.mock('@/engine/cameraUtils', () => ({
  applyCamera: (...a: unknown[]) => applyCamera(...a),
  getProjectCameraAt: (t: number) => ({ type: 'jumpTo', center: [t, t], zoom: 3, pitch: 0, bearing: 0 }),
}));

const capturedAt: number[] = [];
const captureCanvas = () => {
  const c = document.createElement('canvas');
  c.width = 1280;
  c.height = 720;
  return c;
};
vi.mock('@/services/frameCapture', () => ({
  canvasToBlob: async (_c: unknown, type: string) => new Blob(['jpegbytes'], { type }),
  withFrameCapturer: async (
    _map: unknown,
    opts: { width: number; height: number; showWatermark: boolean },
    run: (c: { zoomOffset: number; previewZoom: number; captureNow: () => Promise<HTMLCanvasElement> }) => Promise<unknown>,
  ) => {
    expect(opts).toEqual({ width: 1280, height: 720, showWatermark: false });
    return run({
      zoomOffset: 0.5,
      previewZoom: 3,
      captureNow: async () => {
        capturedAt.push(useProjectStore.getState().playheadTime);
        return captureCanvas();
      },
    });
  },
}));

import { setAgentMapRef, setAgentRuntimeRef } from '../mapRef';
import { runAgentTool } from '../runner';
import { agentEvents } from '../events';
import { resetAgentTestState, resultJson } from '../testHelpers';

function installMap() {
  const runtime = {
    sync: vi.fn(),
    renderAt: vi.fn(),
    waitUntilRendered: vi.fn(async () => {}),
    getMap: vi.fn(),
  };
  const map = { triggerRepaint: vi.fn() };
  setAgentMapRef({ current: { getMap: () => map } } as never);
  setAgentRuntimeRef({ current: runtime } as never);
  return { map, runtime };
}

describe('render_frames', () => {
  beforeEach(() => {
    resetAgentTestState();
    capturedAt.length = 0;
    applyCamera.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
  });

  it('steps the playhead per frame, returns one jpeg per time and restores the playhead', async () => {
    const { runtime, map } = installMap();
    useProjectStore.getState().setPlayheadTime(7);

    const result = await runAgentTool('render_frames', { times: [0, 12.5, 30], width: 640 });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(4);
    expect(result.content[0].type).toBe('text');
    const body = resultJson<{ frames: { index: number; time: number; width: number; height: number }[] }>(result);
    expect(body.frames).toEqual([
      { index: 0, time: 0, width: 640, height: 360 },
      { index: 1, time: 12.5, width: 640, height: 360 },
      { index: 2, time: 30, width: 640, height: 360 },
    ]);
    for (const item of result.content.slice(1)) {
      expect(item).toMatchObject({ type: 'image', mimeType: 'image/jpeg' });
      expect(item.type === 'image' && item.data.length).toBeGreaterThan(0);
    }

    expect(capturedAt).toEqual([0, 12.5, 30]);
    expect(applyCamera).toHaveBeenNthCalledWith(2, map, expect.objectContaining({ center: [12.5, 12.5] }), 0.5);
    expect(runtime.sync).toHaveBeenCalledTimes(3);
    expect(runtime.renderAt).toHaveBeenLastCalledWith(30);
    expect(runtime.waitUntilRendered).toHaveBeenCalledTimes(3);
    expect(useProjectStore.getState().playheadTime).toBe(7);
    // no undo step, and events are read-only success
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0);
    expect(agentEvents.getLog().at(-1)).toMatchObject({ tool: 'render_frames', phase: 'succeeded' });
  });

  it('restores the playhead when a frame fails', async () => {
    const { runtime } = installMap();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runtime.waitUntilRendered.mockRejectedValueOnce(new Error('tiles timed out'));
    useProjectStore.getState().setPlayheadTime(4);
    const result = await runAgentTool('render_frames', { times: [1] });
    expect(result.isError).toBe(true);
    expect(useProjectStore.getState().playheadTime).toBe(4);
  });

  it('validates input and refuses when busy or not ready', async () => {
    expect(resultJson(await runAgentTool('render_frames', { times: [] })).error).toBe('invalid_input');
    expect(resultJson(await runAgentTool('render_frames', { times: Array.from({ length: 9 }, (_, i) => i) })).error).toBe('invalid_input');
    expect(resultJson(await runAgentTool('render_frames', { times: [1], width: 4000 })).error).toBe('invalid_input');

    expect(resultJson(await runAgentTool('render_frames', { times: [1] })).error).toBe('map_not_ready');

    installMap();
    expect(resultJson(await runAgentTool('render_frames', { times: [31] })).error).toBe('time_out_of_range');

    useProjectStore.setState({ isExporting: true });
    expect(resultJson(await runAgentTool('render_frames', { times: [1] })).error).toBe('export_in_progress');
    useProjectStore.setState({ isExporting: false, isPlaying: true });
    expect(resultJson(await runAgentTool('render_frames', { times: [1] })).error).toBe('playback_running');
  });
});
