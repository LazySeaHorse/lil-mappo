import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchBoundary, parseCountryCode } from './nominatim';
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

describe('country code', () => {
  const stub = (props: Record<string, unknown>) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { display_name: 'X', type: 'administrative', ...props }, geometry: syntheticIsland() }],
  }))));

  it('requests extratags', async () => {
    stub({});
    await searchBoundary('x');
    expect(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('extratags=1');
  });

  it('lowercases the ISO3166-1 extratag', async () => {
    stub({ extratags: { 'ISO3166-1': 'FR' } });
    expect((await searchBoundary('x'))[0].countryCode).toBe('fr');
  });

  it('prefers ISO3166-1:alpha2 and is null when absent or malformed', async () => {
    stub({ extratags: { 'ISO3166-1:alpha2': 'DE', 'ISO3166-1': 'DEU' } });
    expect((await searchBoundary('x'))[0].countryCode).toBe('de');
    stub({ extratags: { wikidata: 'Q1' } });
    expect((await searchBoundary('x'))[0].countryCode).toBeNull();
    stub({});
    expect((await searchBoundary('x'))[0].countryCode).toBeNull();
    expect(parseCountryCode({ 'ISO3166-1': 'DEU' })).toBeNull();
    expect(parseCountryCode(null)).toBeNull();
  });
});
