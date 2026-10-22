import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log: string[] = [];

const mux = vi.hoisted(() => ({
  outputs: [] as Array<{ state: string; cancel: ReturnType<typeof vi.fn>; finalize: ReturnType<typeof vi.fn> }>,
  packets: [] as unknown[],
}));

vi.mock('mediabunny', () => {
  class Output {
    state = 'pending';
    cancel = vi.fn(async () => { this.state = 'canceled'; });
    finalize = vi.fn(async () => { this.state = 'finalized'; });
    constructor() { mux.outputs.push(this); }
    addVideoTrack() {}
    async start() { this.state = 'started'; }
  }
  class EncodedVideoPacketSource {
    add = vi.fn(async (packet: unknown) => { mux.packets.push(packet); });
    close = vi.fn();
  }
  return {
    Output,
    EncodedVideoPacketSource,
    Mp4OutputFormat: class {},
    EncodedPacket: { fromEncodedChunk: (chunk: unknown) => chunk },
  };
});

const target = vi.hoisted(() => ({
  created: 0,
  discard: vi.fn(async () => undefined),
  getBlob: vi.fn(async () => new Blob(['mp4'], { type: 'video/mp4' })),
}));
vi.mock('./videoExportTarget', () => ({
  createVideoExportTarget: async () => {
    target.created++;
    return { target: {}, storage: 'memory', discard: target.discard, getBlob: target.getBlob };
  },
}));

const compositeFrame = vi.fn((...args: unknown[]) => { log.push(`composite:${args[6]}`); });
vi.mock('./mapCapture', () => ({
  compositeFrame: (...a: unknown[]) => compositeFrame(...a),
  withTemporaryMapViewport: async (_m: unknown, _w: number, _h: number, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/overlays', () => ({
  resolveSystemOverlays: () => ['overlay'],
  preloadOverlayAssets: async () => undefined,
}));
vi.mock('@/annotations/draw', () => ({ loadAnnotationAssets: async () => undefined }));
vi.mock('@/components/MapViewport/runtime/mapWait', () => ({ waitForMapIdle: async () => 'idle' }));
const applyCamera = vi.fn((_map: unknown, cam: { center: number[] }, zoomOffset: number) => {
  log.push(`camera:${cam.center[0]}:${zoomOffset}`);
});
vi.mock('@/engine/cameraUtils', () => ({
  applyCamera: (...a: [unknown, { center: number[] }, number]) => applyCamera(...a),
  getProjectCameraAt: (t: number) => ({ type: 'jumpTo', center: [t, 0], zoom: 3, pitch: 0, bearing: 0 }),
  loadProjectTerrain: async () => undefined,
}));

import { useProjectStore } from '@/store/useProjectStore';
import { runExport } from './videoExport';

const encoders: FakeEncoder[] = [];
class FakeEncoder {
  static isConfigSupported = vi.fn(async () => ({ supported: true }));
  state = 'unconfigured';
  encodeQueueSize = 0;
  encoded: Array<{ timestamp: number; duration: number; keyFrame: boolean }> = [];
  constructor(private readonly init: { output: (chunk: unknown, meta?: unknown) => void; error: (e: Error) => void }) {
    encoders.push(this);
  }
  configure() { this.state = 'configured'; }
  encode(frame: { timestamp: number; duration: number }, opts: { keyFrame: boolean }) {
    log.push(`encode:${frame.timestamp}`);
    this.encoded.push({ timestamp: frame.timestamp, duration: frame.duration, keyFrame: opts.keyFrame });
    this.init.output({ timestamp: frame.timestamp });
  }
  fail(message: string) { this.init.error(new Error(message)); }
  async flush() {}
  close() { this.state = 'closed'; }
}
class FakeFrame {
  timestamp: number;
  duration: number;
  constructor(_canvas: unknown, init: { timestamp: number; duration: number }) {
    this.timestamp = init.timestamp;
    this.duration = init.duration;
  }
  close() {}
}

function installRuntime() {
  const map = {
    getContainer: () => ({ clientWidth: 640 }),
    triggerRepaint: vi.fn(() => { log.push('repaint'); }),
  };
  const runtime = {
    getMap: () => map,
    sync: vi.fn(() => { log.push('sync'); }),
    renderAt: vi.fn((t: number) => { log.push(`renderAt:${t}`); }),
    waitUntilRendered: vi.fn(async () => { log.push('rendered'); }),
  };
  return { map, runtime, ref: { current: runtime } as never };
}

const options = (overrides: Record<string, unknown> = {}) => ({
  renderConfig: { resolution: [1280, 720], fps: 2 } as never,
  onProgress: vi.fn(),
  abortSignal: new AbortController().signal,
  branding: 'free' as never,
  ...overrides,
});

describe('runExport', () => {
  beforeEach(() => {
    log.length = 0;
    encoders.length = 0;
    mux.outputs.length = 0;
    mux.packets.length = 0;
    target.created = 0;
    vi.clearAllMocks();
    vi.stubGlobal('VideoEncoder', FakeEncoder);
    vi.stubGlobal('VideoFrame', FakeFrame);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
    useProjectStore.setState({ duration: 1, playheadTime: 0.25 });
    useProjectStore.setState({
      setPlayheadTime: (t: number) => {
        log.push(`playhead:${t}`);
        useProjectStore.setState({ playheadTime: t });
      },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('steps, renders, composites and encodes every frame in order, then finalizes', async () => {
    const { ref } = installRuntime();
    const blob = await runExport(ref, options());

    expect(blob).toBeInstanceOf(Blob);
    expect(target.getBlob).toHaveBeenCalledTimes(1);
    const capture = log.slice(log.indexOf('playhead:0'));
    // zoomOffset = log2(1280 / 640) = 1
    expect(capture.slice(0, 7)).toEqual([
      'playhead:0', 'camera:0:1', 'renderAt:0', 'repaint', 'rendered', 'composite:0', 'encode:0',
    ]);
    // The basemap and renderers are reconciled once before capture, not on every frame.
    expect(log.filter((e) => e === 'sync')).toHaveLength(1);
    expect(log.indexOf('sync')).toBeLessThan(log.indexOf('playhead:0'));
    expect(capture.filter((e) => e.startsWith('encode:'))).toEqual(['encode:0', 'encode:500000', 'encode:1000000']);
    expect(capture.filter((e) => e.startsWith('renderAt:'))).toEqual(['renderAt:0', 'renderAt:0.5', 'renderAt:1']);
    expect(encoders[0].encoded.map((f) => f.keyFrame)).toEqual([true, false, false]);
    expect(encoders[0].encoded.every((f) => f.duration === 500000)).toBe(true);
    expect(compositeFrame).toHaveBeenLastCalledWith(
      expect.anything(), expect.anything(), 1280, 720, expect.anything(), expect.anything(), 1, ['overlay'], 1,
    );
    expect(mux.packets).toHaveLength(3);
    expect(mux.outputs[0].finalize).toHaveBeenCalled();
    expect(target.discard).not.toHaveBeenCalled();
    expect(useProjectStore.getState().playheadTime).toBe(0.25);
  });

  it('refuses without a map runtime, before starting an encoder', async () => {
    await expect(runExport({ current: null } as never, options())).rejects.toThrow('Map runtime not available');
    expect(target.created).toBe(0);
    expect(encoders).toHaveLength(0);
  });

  it('cancels the output and discards what was written when aborted', async () => {
    const { ref, runtime } = installRuntime();
    const controller = new AbortController();
    runtime.renderAt.mockImplementation((t: number) => {
      log.push(`renderAt:${t}`);
      if (t === 0.5) controller.abort();
    });

    await expect(runExport(ref, options({ abortSignal: controller.signal }))).rejects.toMatchObject({ name: 'AbortError' });
    expect(encoders[0].state).toBe('closed');
    expect(mux.outputs[0].cancel).toHaveBeenCalled();
    expect(mux.outputs[0].finalize).not.toHaveBeenCalled();
    expect(target.discard).toHaveBeenCalledTimes(1);
  });

  it('stops on an encoder error and discards the output', async () => {
    const { ref, runtime } = installRuntime();
    runtime.renderAt.mockImplementation((t: number) => {
      if (t === 0.5) encoders[0].fail('boom');
    });

    await expect(runExport(ref, options())).rejects.toThrow('VideoEncoder error: boom');
    expect(encoders[0].state).toBe('closed');
    expect(mux.outputs[0].cancel).toHaveBeenCalled();
    expect(target.discard).toHaveBeenCalledTimes(1);
  });

  it('discards the output when the encoder rejects its config', async () => {
    const { ref } = installRuntime();
    vi.spyOn(FakeEncoder.prototype, 'configure').mockImplementation(() => { throw new Error('nope'); });

    await expect(runExport(ref, options())).rejects.toThrow(/H\.264 encoding failed.*nope/);
    expect(mux.outputs[0].cancel).toHaveBeenCalled();
    expect(target.discard).toHaveBeenCalledTimes(1);
  });
});
