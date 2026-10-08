import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchBoundary } from './nominatim';
import { syntheticIsland, decimals } from '@/test/syntheticGeometry';

afterEach(() => vi.unstubAllGlobals());

describe('searchBoundary', () => {
  it('keeps the raw geometry (no simplification) at up to 6 decimals', async () => {
    const island = syntheticIsland();
    island.coordinates[0][5] = [12.1234567891, 41.9876543219];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { display_name: 'Isola, Italia', type: 'island' }, geometry: island }],
    }))));
    const [r] = await searchBoundary('isola');
    const ring = (r.geojson as GeoJSON.Polygon).coordinates[0];
    expect(ring).toHaveLength(island.coordinates[0].length);
    expect(ring[5]).toEqual([12.123457, 41.987654]);
    for (const c of ring) for (const v of c) expect(decimals(v)).toBeLessThanOrEqual(6);
  });
});
