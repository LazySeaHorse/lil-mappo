import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForMapIdle } from './mapWait';

function createMapDouble(loaded = false) {
  const listeners = new Set<() => void>();
  const map = {
    loaded: vi.fn(() => loaded),
    on: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    off: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
  };

  return {
    map: map as unknown as MapboxMap,
    listeners,
    emitIdle: () => [...listeners].forEach((listener) => listener()),
    ...map,
  };
}

describe('waitForMapIdle', () => {
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

  it('waits one paint when the map is already loaded', async () => {
    const double = createMapDouble(true);
    const waiting = waitForMapIdle(double.map);

    expect(double.on).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    await expect(waiting).resolves.toBe('idle');
  });

  it('removes the idle listener after the map becomes idle', async () => {
    const double = createMapDouble();
    const waiting = waitForMapIdle(double.map);

    expect(double.listeners.size).toBe(1);
    double.emitIdle();
    await vi.runAllTimersAsync();

    await expect(waiting).resolves.toBe('idle');
    expect(double.listeners.size).toBe(0);
    expect(double.off).toHaveBeenCalledOnce();
  });

  it('removes the idle listener when the timeout wins', async () => {
    const double = createMapDouble();
    const waiting = waitForMapIdle(double.map, { timeoutMs: 100 });

    await vi.advanceTimersByTimeAsync(100);

    await expect(waiting).resolves.toBe('timeout');
    expect(double.listeners.size).toBe(0);
    expect(double.off).toHaveBeenCalledOnce();
  });

  it('cleans up and rejects when cancelled', async () => {
    const double = createMapDouble();
    const controller = new AbortController();
    const waiting = waitForMapIdle(double.map, { signal: controller.signal });

    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(double.listeners.size).toBe(0);
    expect(double.off).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
