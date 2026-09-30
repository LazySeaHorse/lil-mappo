import type { FreeCameraOptions, Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import { withTemporaryMapViewport } from './mapCapture';
import { useProjectStore } from '@/store/useProjectStore';

function createMapDouble() {
  const container = document.createElement('div');
  container.style.cssText = 'width: 50%; height: 40%; position: absolute; opacity: 0.75;';
  const originalStyles = container.style.cssText;
  const camera = { position: { x: 1, y: 2, z: 3 } } as unknown as FreeCameraOptions;
  const map = {
    getContainer: vi.fn(() => container),
    getFreeCameraOptions: vi.fn(() => camera),
    setFreeCameraOptions: vi.fn(),
    resize: vi.fn(),
  };

  return { map: map as unknown as MapboxMap, container, camera, originalStyles, ...map };
}

describe('withTemporaryMapViewport', () => {
  it('flags the store as capturing only while the viewport is lent, even when capture fails', async () => {
    const double = createMapDouble();
    await withTemporaryMapViewport(double.map, 640, 360, async () => {
      expect(useProjectStore.getState().isCapturingViewport).toBe(true);
    });
    expect(useProjectStore.getState().isCapturingViewport).toBe(false);

    await expect(withTemporaryMapViewport(double.map, 640, 360, async () => {
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(useProjectStore.getState().isCapturingViewport).toBe(false);
  });

  it('restores inline styles and camera after successful capture', async () => {
    const double = createMapDouble();

    const result = await withTemporaryMapViewport(double.map, 1920, 1080, async () => {
      expect(double.container.style.width).toBe('1920px');
      expect(double.container.style.height).toBe('1080px');
      expect(double.container.style.position).toBe('fixed');
      return 'captured';
    });

    expect(result).toBe('captured');
    expect(double.container.style.cssText).toBe(double.originalStyles);
    expect(double.resize).toHaveBeenCalledTimes(2);
    expect(double.setFreeCameraOptions).toHaveBeenCalledOnce();
    expect(double.setFreeCameraOptions).toHaveBeenCalledWith(double.camera);
  });

  it('restores inline styles and camera when capture fails', async () => {
    const double = createMapDouble();
    const failure = new Error('capture failed');

    await expect(withTemporaryMapViewport(double.map, 1280, 720, async () => {
      throw failure;
    })).rejects.toBe(failure);

    expect(double.container.style.cssText).toBe(double.originalStyles);
    expect(double.resize).toHaveBeenCalledTimes(2);
    expect(double.setFreeCameraOptions).toHaveBeenCalledWith(double.camera);
  });
});
