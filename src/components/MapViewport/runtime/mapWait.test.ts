import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForMapIdle } from './mapWait';

function createMapDouble(loaded = false, { tilesLoaded = false } = {}) {
  const listeners = new Map<string, Set<(event?: unknown) => void>>();
  const on = (event: string) => listeners.get(event) ?? listeners.set(event, new Set()).get(event)!;
  const map = {
    loaded: vi.fn(() => loaded),
    areTilesLoaded: vi.fn(() => tilesLoaded),
    on: vi.fn((event: string, listener: () => void) => on(event).add(listener)),
    off: vi.fn((event: string, listener: () => void) => on(event).delete(listener)),
  };

  return {
    map: map as unknown as MapboxMap,
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    emitIdle: () => [...on('idle')].forEach((listener) => listener()),
    emitTileLoaded: () => [...on('sourcedata')].forEach((listener) => listener({ dataType: 'source', tile: {} })),
    emitSourceMetadata: () => [...on('sourcedata')].forEach((listener) => listener({ dataType: 'source', sourceDataType: 'metadata' })),
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

    expect(double.listenerCount()).toBe(1);
    double.emitIdle();
    await vi.runAllTimersAsync();

    await expect(waiting).resolves.toBe('idle');
    expect(double.listenerCount()).toBe(0);
    expect(double.off).toHaveBeenCalledOnce();
  });

  it('removes the idle listener when the timeout wins', async () => {
    const double = createMapDouble();
    const waiting = waitForMapIdle(double.map, { timeoutMs: 100 });

    await vi.advanceTimersByTimeAsync(100);

    await expect(waiting).resolves.toBe('timeout');
    expect(double.listenerCount()).toBe(0);
    expect(double.off).toHaveBeenCalledOnce();
  });

  it('cleans up and rejects when cancelled', async () => {
    const double = createMapDouble();
    const controller = new AbortController();
    const waiting = waitForMapIdle(double.map, { signal: controller.signal });

    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    expect(double.listenerCount()).toBe(0);
    expect(double.off).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the reason the signal was aborted with', async () => {
    const double = createMapDouble();
    const controller = new AbortController();
    const reason = new Error('offline');
    const waiting = waitForMapIdle(double.map, { signal: controller.signal });

    controller.abort(reason);

    await expect(waiting).rejects.toBe(reason);
    expect(double.listenerCount()).toBe(0);
  });

  it('counts a map whose tiles have all loaded as ready when the time runs out', async () => {
    const double = createMapDouble(false, { tilesLoaded: true });
    const waiting = waitForMapIdle(double.map, { timeoutMs: 100 });

    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTimersAsync();

    await expect(waiting).resolves.toBe('idle');
    expect(double.listenerCount()).toBe(0);
  });

  describe('extendWhileLoading', () => {
    it('restarts the time limit each time a tile arrives', async () => {
      const double = createMapDouble();
      let result: string | undefined;
      void waitForMapIdle(double.map, { timeoutMs: 100, extendWhileLoading: true }).then((r) => { result = r; });

      await vi.advanceTimersByTimeAsync(90);
      double.emitTileLoaded();
      await vi.advanceTimersByTimeAsync(90);
      expect(result).toBeUndefined();

      await vi.advanceTimersByTimeAsync(10);
      expect(result).toBe('timeout');
      expect(double.listenerCount()).toBe(0);
    });

    it('does not count source events without a tile as progress', async () => {
      const double = createMapDouble();
      const waiting = waitForMapIdle(double.map, { timeoutMs: 100, extendWhileLoading: true });

      await vi.advanceTimersByTimeAsync(90);
      double.emitSourceMetadata();
      await vi.advanceTimersByTimeAsync(10);

      await expect(waiting).resolves.toBe('timeout');
    });

    it('leaves the time limit fixed without the option', async () => {
      const double = createMapDouble();
      const waiting = waitForMapIdle(double.map, { timeoutMs: 100 });

      await vi.advanceTimersByTimeAsync(90);
      double.emitTileLoaded();
      await vi.advanceTimersByTimeAsync(10);

      await expect(waiting).resolves.toBe('timeout');
    });
  });
});
