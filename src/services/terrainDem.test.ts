import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeTerrainRgb,
  demElevation,
  demVersion,
  demZoomFor,
  loadDem,
  onDemLoaded,
  putDemTile,
  resetDem,
  tilesFor,
} from './terrainDem';

/** A tile whose height rises 1 m per pixel eastward from `base`. */
const ramp = (size: number, base: number) => ({
  size,
  heights: Float32Array.from({ length: size * size }, (_, i) => base + (i % size)),
});

afterEach(() => {
  resetDem();
  vi.unstubAllGlobals();
});

describe('terrain DEM', () => {
  it('decodes Terrain-RGB heights', () => {
    // 0 m is (R·65536 + G·256 + B) = 100000 → (1, 134, 160).
    const heights = decodeTerrainRgb([1, 134, 160, 255, 1, 134, 170, 255], 1);
    expect(heights[0]).toBeCloseTo(0, 3);
    expect(decodeTerrainRgb([1, 134, 170, 255], 1)[0]).toBeCloseTo(1, 3);
  });

  it('picks a zoom that keeps the download to a few tiles', () => {
    const alps: [number, number, number, number] = [7.8, 46.5, 8.9, 47.3];
    const z = demZoomFor(alps);
    expect(tilesFor(alps, z).length).toBeLessThanOrEqual(16);
    expect(tilesFor(alps, z + 1).length).toBeGreaterThan(9);
    // A continent-wide flight still fits.
    expect(tilesFor([-120, 30, -70, 48], demZoomFor([-120, 30, -70, 48])).length).toBeLessThanOrEqual(16);
  });

  it('answers heights from loaded tiles, and null elsewhere', () => {
    expect(demElevation(0.1, 0.1)).toBeNull();
    // Zoom 2 tile (2, 1) covers lng 0..90, lat 0..66.5, at one pixel per degree of longitude.
    putDemTile(2, 2, 1, ramp(90, 100));
    const west = demElevation(1, 10)!;
    const east = demElevation(81, 10)!;
    expect(east - west).toBeCloseTo(80, 0);
    expect(demElevation(-10, 10)).toBeNull();
  });

  it('remembers a failed download instead of retrying it, and tells listeners it settled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = vi.fn();
    const off = onDemLoaded(listener);
    const before = demVersion();
    const bounds: [number, number, number, number] = [8, 46, 8.1, 46.1];
    await Promise.all([loadDem(bounds, 'token'), loadDem(bounds, 'token')]);
    const fetched = fetchMock.mock.calls.length;
    expect(fetched).toBe(tilesFor(bounds, demZoomFor(bounds)).length);
    await loadDem(bounds, 'token');
    expect(fetchMock.mock.calls.length).toBe(fetched);
    expect(demVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalled();
    expect(demElevation(8.05, 46.05)).toBeNull();
    off();
  });

  it('skips the download without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await loadDem([8, 46, 8.1, 46.1], '');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
