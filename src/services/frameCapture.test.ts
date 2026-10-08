import { beforeEach, describe, expect, it, vi } from 'vitest';

const compositeFrame = vi.fn();
const withTemporaryMapViewport = vi.fn(async (_m: unknown, _w: number, _h: number, fn: () => Promise<unknown>) => fn());
vi.mock('./mapCapture', () => ({
  compositeFrame: (...a: unknown[]) => compositeFrame(...a),
  withTemporaryMapViewport: (...a: [unknown, number, number, () => Promise<unknown>]) => withTemporaryMapViewport(...a),
}));
vi.mock('@/annotations/draw', () => ({ loadAnnotationAssets: vi.fn(async () => {}) }));
const waitForMapIdle = vi.fn(async () => 'idle');
vi.mock('@/components/MapViewport/runtime/mapWait', () => ({ waitForMapIdle: (...a: unknown[]) => waitForMapIdle(...(a as [])) }));

vi.mock('@/overlays', async (orig) => ({
  ...(await orig<typeof import('@/overlays')>()),
  preloadOverlayAssets: vi.fn(async () => {}),
}));

import { resolveSystemOverlays } from '@/overlays';
import { canvasToBlob, withFrameCapturer } from './frameCapture';
import { useProjectStore } from '@/store/useProjectStore';

const fakeMap = {
  getContainer: () => ({ getBoundingClientRect: () => ({ width: 640 }) }),
  getZoom: () => 3,
} as never;

const overlays = resolveSystemOverlays({ mode: 'export', branding: 'free' });

describe('withFrameCapturer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as never);
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
  });

  it('exposes zoom offset and composites at the current playhead', async () => {
    useProjectStore.getState().setPlayheadTime(4);
    const result = await withFrameCapturer(fakeMap, { width: 1280, height: 720, overlays }, async (c) => {
      expect(c.zoomOffset).toBe(1);
      expect(c.previewZoom).toBe(3);
      const canvas = await c.captureNow();
      return { w: canvas.width, h: canvas.height };
    });
    expect(result).toEqual({ w: 1280, h: 720 });
    expect(withTemporaryMapViewport).toHaveBeenCalledWith(fakeMap, 1280, 720, expect.any(Function));
    expect(waitForMapIdle).toHaveBeenCalled();
    expect(compositeFrame).toHaveBeenCalledWith(fakeMap, expect.anything(), 1280, 720, expect.anything(), expect.anything(), 4, overlays, 1);
  });

  it('rejects when canvas conversion fails', async () => {
    const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
    await expect(canvasToBlob(canvas, 'image/png')).rejects.toThrow('Format conversion failed');
  });
});
