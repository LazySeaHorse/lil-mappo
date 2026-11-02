import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchBoundaries, MAX_PRESENT_RESULTS, MAX_HISTORICAL_RESULTS } from './boundarySearch';
import { syntheticIsland } from '@/test/syntheticGeometry';

afterEach(() => vi.unstubAllGlobals());

const presentBody = (n: number) => JSON.stringify({
  type: 'FeatureCollection',
  features: Array.from({ length: n }, (_, i) => ({
    type: 'Feature',
    properties: { display_name: `Place ${i}, Region, Country`, type: 'administrative', extratags: i === 0 ? { 'ISO3166-1': 'FR' } : {} },
    geometry: syntheticIsland(),
  })),
});

const historicalBody = (places: number, periodsEach = 2) => JSON.stringify(
  Array.from({ length: places }, (_, p) => Array.from({ length: periodsEach }, (_, v) => ({
    osm_type: 'relation', osm_id: p * 100 + v, name: `Old ${p}`, addresstype: 'country',
    extratags: { wikidata: `Q${p}`, start_date: String(1500 + v * 50), end_date: String(1550 + v * 50) },
  }))).flat(),
);

type Respond = (url: URL) => Response | Promise<Response>;
function stubFetch(respond: Respond) {
  const fetchMock = vi.fn(async (input: unknown) => respond(new URL(String(input))));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const isOhm = (url: URL) => url.hostname === 'nominatim.openhistoricalmap.org';

describe('searchBoundaries', () => {
  it('returns present results first, then historical places', async () => {
    stubFetch((url) => new Response(isOhm(url) ? historicalBody(2) : presentBody(2)));
    const results = await searchBoundaries('x');
    expect(results.map((r) => r.kind)).toEqual(['present', 'present', 'historical', 'historical']);
    const [first, , old] = results;
    expect(first).toMatchObject({ kind: 'present', placeName: 'Place 0', displayName: 'Place 0, Region, Country', type: 'administrative', countryCode: 'fr' });
    if (first.kind === 'present') expect(first.geojson.type).toBe('Polygon');
    expect(old).toMatchObject({ kind: 'historical', placeName: 'Old 0', groupKey: 'Q0', wikidata: 'Q0', type: 'country' });
    if (old.kind === 'historical') expect(old.versions).toHaveLength(2);
  });

  it('caps present at 5 and historical places at 8', async () => {
    stubFetch((url) => new Response(isOhm(url) ? historicalBody(12) : presentBody(9)));
    const results = await searchBoundaries('x');
    expect(results.filter((r) => r.kind === 'present')).toHaveLength(MAX_PRESENT_RESULTS);
    expect(results.filter((r) => r.kind === 'historical')).toHaveLength(MAX_HISTORICAL_RESULTS);
  });

  it('passes the signal and the view on to the providers', async () => {
    const controller = new AbortController();
    const fetchMock = stubFetch((url) => new Response(isOhm(url) ? '[]' : presentBody(0)));
    await searchBoundaries('park', controller.signal, [-74.1, 40.7, -73.8, 40.9]);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) expect(init.signal).toBe(controller.signal);
    const nominatim = new URL(calls.find(([u]) => !u.includes('openhistoricalmap'))![0]);
    expect(nominatim.searchParams.get('viewbox')).toBe('-74.1,40.9,-73.8,40.7');
  });

  it('still returns present results when the historical source fails', async () => {
    stubFetch((url) => (isOhm(url) ? new Response('', { status: 503 }) : new Response(presentBody(2))));
    expect((await searchBoundaries('x')).map((r) => r.kind)).toEqual(['present', 'present']);
  });

  it('still returns historical results when the present source fails', async () => {
    stubFetch((url) => (isOhm(url) ? new Response(historicalBody(1)) : new Response('', { status: 500 })));
    expect((await searchBoundaries('x')).map((r) => r.kind)).toEqual(['historical']);
  });

  it('throws when both fail', async () => {
    stubFetch(() => new Response('', { status: 500 }));
    await expect(searchBoundaries('x')).rejects.toThrow('Nominatim error: 500');
  });

  it('returns nothing, without error, when neither finds a place', async () => {
    stubFetch((url) => new Response(isOhm(url) ? '[]' : presentBody(0)));
    expect(await searchBoundaries('zzz')).toEqual([]);
  });

  it('rejects with an AbortError when aborted, even if one source answered', async () => {
    const controller = new AbortController();
    stubFetch((url) => {
      if (isOhm(url)) return new Response(historicalBody(1));
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(searchBoundaries('x', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with an AbortError when one source is aborted and the other failed', async () => {
    stubFetch((url) => {
      if (isOhm(url)) return new Response('', { status: 500 });
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(searchBoundaries('x')).rejects.toMatchObject({ name: 'AbortError' });
  });
});
