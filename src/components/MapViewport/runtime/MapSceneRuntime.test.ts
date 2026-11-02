import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForMapRender } from './MapSceneRuntime';

function createMapDouble(loaded: boolean) {
  const listeners = new Set<() => void>();
  const map = {
    loaded: vi.fn(() => loaded),
    on: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    off: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  };
  return map as unknown as MapboxMap;
}

describe('waitForMapRender', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      setTimeout(() => callback(0), 0) as unknown as number
    ));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports a timeout when the map never goes idle', async () => {
    const waiting = waitForMapRender(createMapDouble(false), 100);

    await vi.advanceTimersByTimeAsync(100);

    await expect(waiting).resolves.toBe('timeout');
  });

  it('reports idle once a loaded map has painted', async () => {
    const waiting = waitForMapRender(createMapDouble(true), 100);

    await vi.runAllTimersAsync();

    await expect(waiting).resolves.toBe('idle');
  });
});
