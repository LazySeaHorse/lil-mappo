import type { FreeCameraOptions, Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import { withTemporaryMapViewport } from './mapCapture';

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
