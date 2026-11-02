import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { searchHistorical, fetchHistoricalOutline, clearHistoricalOutlineCache } from './openHistoricalMap';
import { syntheticIsland, decimals } from '@/test/syntheticGeometry';

beforeEach(() => clearHistoricalOutlineCache());
afterEach(() => vi.unstubAllGlobals());

function item(osmId: number, name: string, tags: Record<string, string>, extra: Record<string, unknown> = {}) {
  return { osm_type: 'relation', osm_id: osmId, name, display_name: `${name}, Somewhere`, addresstype: 'country', type: 'administrative', extratags: tags, ...extra };
}

function stubSearch(items: unknown[]) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(items)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const lastUrl = () => new URL(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]));

describe('searchHistorical', () => {
  it('asks for every period, in English, with the extra tags', async () => {
    stubSearch([]);
    await searchHistorical('Prussia & co');
    const url = lastUrl();
    expect(url.origin).toBe('https://nominatim.openhistoricalmap.org');
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('Prussia & co');
    expect(url.searchParams.get('dedupe')).toBe('0');
    expect(url.searchParams.get('accept-language')).toBe('en');
    expect(url.searchParams.get('extratags')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('40');
  });

  it('groups periods of one place by wikidata and sorts them by start', async () => {
    stubSearch([
      item(3, 'Kingdom of Prussia', { wikidata: 'Q27306', start_date: '1867', end_date: '1876' }),
      item(1, 'Kingdom of Prussia', { wikidata: 'Q27306', start_date: '1701-01-18', end_date: '1744' }),
      item(4, 'Hanover', { wikidata: 'Q706018', start_date: '1814' }),
      item(2, 'Kingdom of Prussia', { wikidata: 'Q27306', start_date: '1744', end_date: '1867' }),
    ]);
    const places = await searchHistorical('prussia');
    expect(places.map((p) => p.placeName)).toEqual(['Kingdom of Prussia', 'Hanover']);
    const [prussia, hanover] = places;
    expect(prussia.groupKey).toBe('Q27306');
    expect(prussia.wikidata).toBe('Q27306');
    expect(prussia.type).toBe('country');
    expect(prussia.versions.map((v) => v.osmId)).toEqual(['R1', 'R2', 'R3']);
    expect(prussia.versions[0]).toEqual({ osmId: 'R1', startDate: '1701-01-18', endDate: '1744', notes: [] });
    expect(hanover.versions).toEqual([{ osmId: 'R4', startDate: '1814', endDate: null, notes: [] }]);
  });

  it('keeps the order of the first hit of each place', async () => {
    stubSearch([
      item(1, 'B', { wikidata: 'Q2', start_date: '1900' }),
      item(2, 'A', { wikidata: 'Q1', start_date: '1900' }),
      item(3, 'B', { wikidata: 'Q2', start_date: '1800' }),
    ]);
    expect((await searchHistorical('x')).map((p) => p.placeName)).toEqual(['B', 'A']);
  });

  it('groups by name and kind when there is no wikidata, and keeps different kinds apart', async () => {
    stubSearch([
      item(1, 'Duchy of X', { start_date: '1500', end_date: '1600' }),
      item(2, 'duchy of x', { start_date: '1600', end_date: '1700' }),
      item(3, 'Duchy of X', { start_date: '1700' }, { addresstype: 'state' }),
    ]);
    const places = await searchHistorical('x');
    expect(places).toHaveLength(2);
    expect(places[0].wikidata).toBeNull();
    expect(places[0].versions.map((v) => v.osmId)).toEqual(['R1', 'R2']);
    expect(places[1].type).toBe('state');
  });

  it('puts a period with an unknown start first and open-ended ones last', async () => {
    stubSearch([
      item(1, 'P', { wikidata: 'Q1', start_date: '1800' }),
      item(2, 'P', { wikidata: 'Q1', end_date: '1700' }),
      item(3, 'P', { wikidata: 'Q1', start_date: '1800', end_date: '1850' }),
    ]);
    const [p] = await searchHistorical('p');
    expect(p.versions.map((v) => v.osmId)).toEqual(['R2', 'R3', 'R1']);
  });

  it('sorts BC periods before AD ones', async () => {
    stubSearch([
      item(1, 'Rome', { wikidata: 'Q1', start_date: '0027' }),
      item(2, 'Rome', { wikidata: 'Q1', start_date: '-0509', end_date: '-0026' }),
    ]);
    expect((await searchHistorical('rome'))[0].versions.map((v) => v.osmId)).toEqual(['R2', 'R1']);
  });

  it('collects fixme notes and ignores nodes, other types and repeats', async () => {
    stubSearch([
      item(1, 'P', { wikidata: 'Q1', start_date: '1800', fixme: ' check borders ', 'fixme:s': 'needs source', note: 'not a fixme' }),
      item(1, 'P', { wikidata: 'Q1', start_date: '1800' }),
      { ...item(2, 'P', { wikidata: 'Q1', start_date: '1801' }), osm_type: 'node' },
      { ...item(3, 'P', { wikidata: 'Q1', start_date: '1802' }), osm_type: 'way' },
    ]);
    const [p] = await searchHistorical('p');
    expect(p.versions).toEqual([
      { osmId: 'R1', startDate: '1800', endDate: null, notes: ['check borders', 'needs source'] },
      { osmId: 'W3', startDate: '1802', endDate: null, notes: [] },
    ]);
  });

  it('names a place from display_name when OHM gives no name, and treats blank dates as missing', async () => {
    stubSearch([{ osm_type: 'relation', osm_id: 9, display_name: 'Nameless, Nowhere', extratags: { start_date: ' ', end_date: '' } }]);
    const [p] = await searchHistorical('q');
    expect(p.placeName).toBe('Nameless');
    expect(p.type).toBe('unknown');
    expect(p.versions[0]).toMatchObject({ startDate: null, endDate: null });
  });

  it('throws on an error response and passes the abort signal on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await expect(searchHistorical('x')).rejects.toThrow('503');
    const controller = new AbortController();
    const fetchMock = stubSearch([]);
    await searchHistorical('x', controller.signal);
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });
});

describe('fetchHistoricalOutline', () => {
  function stubLookup(geometry: GeoJSON.Geometry | null, props: Record<string, unknown> = {}) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: geometry ? [{ type: 'Feature', properties: props, geometry }] : [],
    })));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('looks the period up by id and returns the outline at up to 6 decimals', async () => {
    const island = syntheticIsland();
    island.coordinates[0][2] = [12.1234567891, 41.9876543219];
    const fetchMock = stubLookup(island, { extratags: { 'ISO3166-1': 'DE' } });
    const out = await fetchHistoricalOutline('R2693579');
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.pathname).toBe('/lookup');
    expect(url.searchParams.get('osm_ids')).toBe('R2693579');
    expect(url.searchParams.get('polygon_geojson')).toBe('1');
    expect(out.countryCode).toBe('de');
    const ring = (out.geojson as GeoJSON.Polygon).coordinates[0];
    expect(ring).toHaveLength(island.coordinates[0].length);
    expect(ring[2]).toEqual([12.123457, 41.987654]);
    for (const c of ring) for (const v of c) expect(decimals(v)).toBeLessThanOrEqual(6);
  });

  it('has no country code when OHM gives none', async () => {
    stubLookup(syntheticIsland());
    expect((await fetchHistoricalOutline('R1')).countryCode).toBeNull();
  });

  it('throws when the result is not an area', async () => {
    stubLookup({ type: 'Point', coordinates: [0, 0] });
    await expect(fetchHistoricalOutline('N1')).rejects.toThrow('no outline');
    stubLookup(null);
    await expect(fetchHistoricalOutline('R2')).rejects.toThrow('no outline');
  });

  it('fetches a period once and answers repeats from memory', async () => {
    const fetchMock = stubLookup(syntheticIsland());
    const [a, b] = await Promise.all([fetchHistoricalOutline('R1'), fetchHistoricalOutline('R1')]);
    await fetchHistoricalOutline('R1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('does not keep a failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: syntheticIsland() }] })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchHistoricalOutline('R1')).rejects.toThrow('500');
    await expect(fetchHistoricalOutline('R1')).resolves.toMatchObject({ countryCode: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forgets the oldest outlines once the memory is full', async () => {
    const fetchMock = stubLookup(syntheticIsland());
    for (let i = 1; i <= 9; i++) await fetchHistoricalOutline(`R${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(9);
    await fetchHistoricalOutline('R9');
    expect(fetchMock).toHaveBeenCalledTimes(9);
    await fetchHistoricalOutline('R1');
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('rejects an aborted caller with AbortError but keeps the download for the next one', async () => {
    const fetchMock = stubLookup(syntheticIsland());
    const controller = new AbortController();
    const waiting = fetchHistoricalOutline('R1', controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await expect(fetchHistoricalOutline('R1')).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const already = new AbortController();
    already.abort();
    await expect(fetchHistoricalOutline('R1', already.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
