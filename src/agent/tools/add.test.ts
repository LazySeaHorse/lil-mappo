import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/useAuthStore';
import { useProjectStore } from '@/store/useProjectStore';
import { undo, redo } from '@/store/history';
import { agentEvents } from '../events';
import { runAgentTool } from '../runner';
import { setAgentMapRef } from '../mapRef';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { syntheticIsland } from '@/test/syntheticGeometry';
import { clearHistoricalOutlineCache } from '@/services/openHistoricalMap';
import { historyPast, resetAgentTestState, resultJson } from '../testHelpers';

const state = () => useProjectStore.getState();
const steps = () => useProjectStore.temporal.getState().pastStates.length;
const routes = () => Object.values(state().items).filter((i) => i.kind === 'route');

function stubNetwork() {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('geocode/v6/forward')) {
      const q = new URL(url).searchParams.get('q');
      const table: Record<string, [number, number]> = { Lisbon: [-9.14, 38.72], Porto: [-8.61, 41.15] };
      const c = table[q ?? ''];
      return new Response(JSON.stringify({ features: c ? [{ geometry: { coordinates: c }, properties: { name: q, place_formatted: 'Portugal' } }] : [] }));
    }
    if (url.includes('directions/v5')) {
      return new Response(JSON.stringify({
        routes: [{ distance: 313_000, duration: 11_000, geometry: { type: 'LineString', coordinates: [[-9.14, 38.72], [-8.9, 40], [-8.61, 41.15]] } }],
      }));
    }
    if (url.includes('nominatim')) {
      return new Response(JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature', properties: { display_name: 'Portugal, Europe', type: 'administrative', extratags: { 'ISO3166-1': 'PT' } },
          geometry: { type: 'Polygon', coordinates: [[[-9, 37], [-6, 37], [-6, 42], [-9, 42], [-9, 37]]] },
        }],
      }));
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type OhmHit = { id: number; name: string; start?: string; end?: string; wikidata?: string };

/** Stubs OpenHistoricalMap: `hits` for the search, one square outline for any lookup. Returns the mock so tests can inspect the calls. */
function stubOhm(hits: OhmHit[], opts: { lookupStatus?: number } = {}) {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname === '/search') {
      return new Response(JSON.stringify(hits.map((h) => ({
        osm_type: 'relation', osm_id: h.id, name: h.name, display_name: `${h.name}, wrong suffix`, addresstype: 'country', type: 'administrative',
        extratags: { ...(h.start ? { start_date: h.start } : {}), ...(h.end ? { end_date: h.end } : {}), ...(h.wikidata ? { wikidata: h.wikidata } : {}) },
      }))));
    }
    if (url.pathname === '/lookup') {
      if (opts.lookupStatus) return new Response('{}', { status: opts.lookupStatus });
      return new Response(JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { extratags: {} }, geometry: { type: 'Polygon', coordinates: [[[6, 50], [14, 50], [14, 54], [6, 54], [6, 50]]] } }],
      }));
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const PRUSSIA: OhmHit[] = [
  { id: 1, name: 'Kingdom of Prussia', start: '1701', end: '1867', wikidata: 'Q27306' },
  { id: 2, name: 'Kingdom of Prussia', start: '1867', end: '1876', wikidata: 'Q27306' },
  { id: 3, name: 'Kingdom of Prussia', start: '1876', end: '1918-11-09', wikidata: 'Q27306' },
  { id: 4, name: 'Free State of Prussia', start: '1918-11-09', end: '1947-02-25', wikidata: 'Q161036' },
];

describe('add tools', () => {
  beforeEach(() => {
    clearHistoricalOutlineCache();
    resetAgentTestState();
    useAuthStore.setState({ user: null });
    queryClient.clear();
    stubNetwork();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('add_route car resolves place names, fetches directions and is one labeled ai undo step', async () => {
    const seen: string[] = [];
    const off = agentEvents.subscribe((e) => seen.push(e.phase));
    const result = await runAgentTool('add_route', { mode: 'car', from: 'Lisbon', to: 'Porto', startTime: 2, endTime: 8, style: { color: '#ff0000' } });
    off();
    expect(result.isError).toBeUndefined();
    const body = resultJson<{ created: { id: string; name: string }; distanceMeters: number; driveTimeSeconds: number }>(result);
    expect(body.created.name).toBe('Lisbon to Porto');
    expect(body.distanceMeters).toBe(313_000);
    expect(body.driveTimeSeconds).toBe(11_000);

    const route = state().items[body.created.id];
    expect(route).toMatchObject({ kind: 'route', startTime: 2, endTime: 8, style: { color: '#ff0000', glow: true } });
    expect(route.kind === 'route' && route.calculation).toMatchObject({ startName: 'Lisbon', endName: 'Porto' });
    expect(state().itemOrder).toContain(body.created.id);

    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: add car route "Lisbon to Porto"' });
    expect(seen).toEqual(['started', 'succeeded']);
    expect(agentEvents.getLog()[1].affectedItemIds).toEqual([body.created.id]);

    expect(undo()).toBe(true);
    expect(routes()).toHaveLength(0);
    expect(redo()).toBe(true);
    expect(routes()).toHaveLength(1);
  });

  it('add_route flight gives a Pro user the plane, and a free user the dot', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    queryClient.setQueryData(['subscription', 'u1'], { tier: 'wanderer', status: 'active', renewal_date: null });
    const pro = await runAgentTool('add_route', { mode: 'flight', from: [-9.14, 38.72], to: [2.35, 48.85] });
    const proRoute = state().items[resultJson<{ created: { id: string } }>(pro).created.id];
    expect(proRoute.kind === 'route' && proRoute.calculation?.vehicle?.type).toBe('plane');

    queryClient.setQueryData(['subscription', 'u1'], null);
    const free = await runAgentTool('add_route', { mode: 'flight', from: [-9.14, 38.72], to: [2.35, 48.85] });
    const freeRoute = state().items[resultJson<{ created: { id: string } }>(free).created.id];
    expect(freeRoute.kind === 'route' && freeRoute.calculation?.vehicle?.type).toBe('dot');
  });

  it('add_route flight from coordinates uses a great-circle arc and the dot for a guest', async () => {
    const result = await runAgentTool('add_route', { mode: 'flight', from: [-9.14, 38.72], to: [2.35, 48.85] });
    const { created } = resultJson<{ created: { id: string } }>(result);
    const route = state().items[created.id];
    expect(route.kind === 'route' && route.calculation).toMatchObject({ mode: 'flight', vehicle: { type: 'dot' }, startName: '', endName: '' });
    expect(route.kind === 'route' && route.endTime).toBe(5);
    expect(route.kind === 'route' && route.exitAnimation).toBe('none');
    expect(steps()).toBe(1);
  });

  it('add_route walk builds geometry from points and merges vehicle overrides', async () => {
    const result = await runAgentTool('add_route', {
      mode: 'walk', points: [[0, 0], [0.01, 0.01], [0.02, 0]], curved: false, vehicle: { enabled: false },
    });
    const { created } = resultJson<{ created: { id: string } }>(result);
    const route = state().items[created.id];
    expect(route.kind === 'route' && route.calculation).toMatchObject({ mode: 'walk', curved: false, vehicle: { enabled: false, type: 'dot' } });
    expect(steps()).toBe(1);
  });

  it('rejects bad arguments and time ranges without touching history', async () => {
    const missing = await runAgentTool('add_route', { mode: 'car', from: 'Lisbon' });
    expect(resultJson(missing).error).toBe('missing_endpoints');
    const badTime = await runAgentTool('add_route', { mode: 'flight', from: [0, 0], to: [1, 1], startTime: 10, endTime: 40 });
    expect(resultJson(badTime).error).toBe('invalid_time_range');
    const badPoint = await runAgentTool('add_route', { mode: 'flight', from: [200, 0], to: [1, 1] });
    expect(resultJson(badPoint).error).toBe('invalid_input');
    const unknownPlace = await runAgentTool('add_route', { mode: 'flight', from: 'Atlantis', to: 'Porto' });
    expect(resultJson(unknownPlace).error).toBe('place_not_found');
    expect(steps()).toBe(0);
    expect(routes()).toHaveLength(0);
  });

  it('a failed directions request leaves the project untouched', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).includes('directions')) return new Response('{}', { status: 500 });
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [1, 1] }, properties: { name: 'x' } }] }));
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runAgentTool('add_route', { mode: 'car', from: 'a place', to: 'b place' });
    expect(resultJson(result).error).toBe('directions_failed');
    expect(steps()).toBe(0);
    expect(agentEvents.getLog().at(-1)?.phase).toBe('failed');
  });

  it('add_boundary takes the best polygon and applies style overrides', async () => {
    const result = await runAgentTool('add_boundary', { query: 'Portugal', startTime: 1, endTime: 6, style: { strokeColor: '#00ff00', animationStyle: 'trace' } });
    const body = resultJson<{ created: { id: string; placeName: string }; bbox: number[] }>(result);
    expect(body.created.placeName).toBe('Portugal');
    expect(body.bbox).toEqual([-9, 37, -6, 42]);
    const item = state().items[body.created.id];
    expect(item).toMatchObject({ kind: 'boundary', startTime: 1, endTime: 6, exitAnimation: 'none', style: { strokeColor: '#00ff00', animationStyle: 'trace', fillOpacity: 0.1 } });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: add boundary "Portugal"' });
  });

  it('add_boundary prefills flagCode from the search result without switching to flag fill', async () => {
    const body = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Portugal' }));
    expect(state().items[body.created.id]).toMatchObject({ style: { flagCode: 'pt', fillMode: 'color' } });
  });

  it('add_boundary accepts fillMode flag with an explicit flagCode and rejects unknown codes', async () => {
    const flagged = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Portugal', style: { fillMode: 'flag', flagCode: 'ES' } }));
    expect(state().items[flagged.created.id]).toMatchObject({ style: { fillMode: 'flag', flagCode: 'es' } });
    const bad = await runAgentTool('add_boundary', { query: 'Portugal', style: { fillMode: 'flag', flagCode: 'xx' } });
    expect(bad.isError).toBe(true);
  });

  it('add_boundary accepts the outside-mask style fields and defaults them off', async () => {
    const masked = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Portugal', style: { maskOutside: true, maskColor: '#112233', maskOpacity: 0.5 } }));
    expect(state().items[masked.created.id]).toMatchObject({ style: { maskOutside: true, maskColor: '#112233', maskOpacity: 0.5 } });
    const plain = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Portugal' }));
    expect(state().items[plain.created.id]).toMatchObject({ style: { maskOutside: false, maskColor: '#0b0f19', maskOpacity: 0.85 } });
    const bad = await runAgentTool('add_boundary', { query: 'Portugal', style: { maskOpacity: 2 } });
    expect(bad.isError).toBe(true);
  });

  it('add_boundary simplifies at Standard by default and honours an optional detail level', async () => {
    const island = syntheticIsland();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { display_name: 'Isola, Italia', type: 'island' }, geometry: island }],
    }))));
    const ringOf = (id: string) => ((state().items[id] as { geojson: GeoJSON.Polygon }).geojson.coordinates[0]);
    const std = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Isola' }));
    expect(ringOf(std.created.id)).toEqual((applyBoundaryDetail(island, 'standard') as GeoJSON.Polygon).coordinates[0]);
    const light = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Isola', detail: 'light' }));
    expect(ringOf(light.created.id).length).toBeLessThan(ringOf(std.created.id).length);
  });

  it('add_boundary reports when nothing matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }))));
    const result = await runAgentTool('add_boundary', { query: 'Nowhereland' });
    expect(resultJson(result).error).toBe('boundary_not_found');
    expect(steps()).toBe(0);
  });

  it('add_boundary without year never touches OpenHistoricalMap and stores no source', async () => {
    const fetchMock = stubNetwork();
    const body = resultJson<{ created: { id: string; historical?: unknown } }>(await runAgentTool('add_boundary', { query: 'Portugal' }));
    expect(state().items[body.created.id]).toMatchObject({ source: null });
    expect(body.created.historical).toBeUndefined();
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('openhistoricalmap'))).toBe(true);
  });

  it('add_boundary with year picks the period that covers it and records the source', async () => {
    const fetchMock = stubOhm(PRUSSIA);
    const result = await runAgentTool('add_boundary', { query: 'Prussia', year: 1870, startTime: 2, endTime: 7 });
    const body = resultJson<{ created: { id: string; placeName: string; historical: { period: string; source: string } }; period: string; source: string; bbox: number[] }>(result);
    expect(body.created.placeName).toBe('Kingdom of Prussia');
    expect(body.period).toBe('1867–1876');
    expect(body.source).toBe('OpenHistoricalMap');
    expect(body.created.historical).toEqual({ period: '1867–1876', source: 'OpenHistoricalMap' });
    expect(body.bbox).toEqual([6, 50, 14, 54]);
    expect(result.content[0].type).toBe('text');
    const item = state().items[body.created.id];
    expect(item).toMatchObject({
      kind: 'boundary', placeName: 'Kingdom of Prussia', startTime: 2, endTime: 7,
      source: {
        provider: 'ohm', osmId: 'R2', wikidata: 'Q27306', startDate: '1867', endDate: '1876',
        versions: [{ osmId: 'R1', startDate: '1701' }, { osmId: 'R2', startDate: '1867' }, { osmId: 'R3', endDate: '1918-11-09' }],
      },
    });
    // only the chosen period's outline is downloaded
    const lookups = fetchMock.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.pathname === '/lookup');
    expect(lookups).toHaveLength(1);
    expect(lookups[0].searchParams.get('osm_ids')).toBe('R2');
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: add boundary "Kingdom of Prussia" (1867–1876)' });
  });

  it('add_boundary reports the period and source in the summary', async () => {
    stubOhm(PRUSSIA);
    const result = await runAgentTool('add_boundary', { query: 'Prussia', year: 1870 });
    expect(agentEvents.getLog().at(-1)).toMatchObject({ phase: 'succeeded', summary: expect.stringContaining('Added boundary "Kingdom of Prussia" (1867–1876, OpenHistoricalMap') });
    expect(result.isError).toBeUndefined();
  });

  it('add_boundary hands a shared year to the later period, so adjacent periods do not both match', async () => {
    stubOhm(PRUSSIA);
    const at1876 = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1876 }));
    expect(state().items[at1876.created.id]).toMatchObject({ source: { osmId: 'R3' } });
    const at1867 = resultJson<{ created: { id: string } }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1867 }));
    expect(state().items[at1867.created.id]).toMatchObject({ source: { osmId: 'R2' } });
  });

  it('add_boundary takes the first covering place in OpenHistoricalMap order and lists the others', async () => {
    stubOhm([
      { id: 10, name: 'Brandenburg-Prussia', start: '1618', end: '1701', wikidata: 'Q157367' },
      ...PRUSSIA,
    ]);
    const body = resultJson<{ created: { placeName: string }; otherPlacesInThatYear: string[] }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1930 }));
    expect(body.created.placeName).toBe('Free State of Prussia');
    expect(body.otherPlacesInThatYear).toEqual([]);
    stubOhm([...PRUSSIA, { id: 11, name: 'Hanover', start: '1866', end: '1866', wikidata: 'Q706018' }]);
    const both = resultJson<{ created: { placeName: string }; otherPlacesInThatYear: string[] }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1866 }));
    expect(both.created.placeName).toBe('Kingdom of Prussia');
    expect(both.otherPlacesInThatYear).toEqual(['Hanover (1866)']);
  });

  it('add_boundary treats negative years as astronomical BC years (-44 is 45 BC)', async () => {
    stubOhm([
      { id: 20, name: 'Roman Republic', start: '-0508', end: '-0026', wikidata: 'Q17167' },
      { id: 21, name: 'Roman Empire', start: '-0026', end: '0476', wikidata: 'Q2277' },
    ]);
    const caesar = resultJson<{ created: { placeName: string }; period: string }>(await runAgentTool('add_boundary', { query: 'Rome', year: -44 }));
    expect(caesar).toMatchObject({ created: { placeName: 'Roman Republic' }, period: '509 BC–27 BC' });
    const trajan = resultJson<{ created: { placeName: string } }>(await runAgentTool('add_boundary', { query: 'Rome', year: 117 }));
    expect(trajan.created.placeName).toBe('Roman Empire');
    const year0 = resultJson<{ created: { placeName: string } }>(await runAgentTool('add_boundary', { query: 'Rome', year: 0 }));
    expect(year0.created.placeName).toBe('Roman Empire');
  });

  it('add_boundary errors with the available periods when no period covers the year', async () => {
    stubOhm(PRUSSIA);
    const result = await runAgentTool('add_boundary', { query: 'Prussia', year: 1500 });
    expect(result.isError).toBe(true);
    const err = resultJson<{ error: string; message: string; places: { name: string; periods: string[] }[] }>(result);
    expect(err.error).toBe('boundary_year_not_found');
    expect(err.message).toContain('1500');
    expect(err.message).toContain('Kingdom of Prussia: 1701–1867, 1867–1876, 1876–1918');
    expect(err.message).toContain('Free State of Prussia: 1918–1947');
    expect(err.places.map((p) => p.name)).toEqual(['Kingdom of Prussia', 'Free State of Prussia']);
    expect(steps()).toBe(0);
  });

  it('add_boundary caps the periods it lists in the error, keeping those nearest the year', async () => {
    const many: OhmHit[] = Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, name: 'Kingdom of Prussia', start: String(1700 + i * 10), end: String(1710 + i * 10), wikidata: 'Q27306' }));
    stubOhm(many);
    const err = resultJson<{ message: string }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1600 }));
    expect(err.message).toContain('1700–1710, 1710–1720, 1720–1730, 1730–1740 (+8 more periods)');
  });

  it('add_boundary says when OpenHistoricalMap finds nothing and suggests another name', async () => {
    stubOhm([]);
    const err = resultJson<{ error: string; message: string }>(await runAgentTool('add_boundary', { query: 'Atlantis', year: 1900 }));
    expect(err.error).toBe('boundary_not_found');
    expect(err.message).toMatch(/English or the historical name/);
    expect(steps()).toBe(0);
  });

  it('add_boundary turns historical search and outline failures into tool errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const search = resultJson<{ error: string }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1870 }));
    expect(search.error).toBe('boundary_search_failed');
    stubOhm(PRUSSIA, { lookupStatus: 500 });
    const outline = resultJson<{ error: string }>(await runAgentTool('add_boundary', { query: 'Prussia', year: 1870 }));
    expect(outline.error).toBe('boundary_outline_failed');
    expect(steps()).toBe(0);
  });

  it('add_boundary rejects a non-integer year', async () => {
    stubOhm(PRUSSIA);
    expect((await runAgentTool('add_boundary', { query: 'Prussia', year: 1870.5 })).isError).toBe(true);
    expect((await runAgentTool('add_boundary', { query: 'Prussia', year: '1870' })).isError).toBe(true);
  });

  it('add_callout pins to a geocoded place with the UI defaults', async () => {
    state().setPlayheadTime(3);
    const result = await runAgentTool('add_callout', { title: 'Hello', subtitle: 'World', location: 'Lisbon', styleId: 'leader-line', anchor: 'top' });
    const { created } = resultJson<{ created: { id: string } }>(result);
    const item = state().items[created.id];
    expect(item).toMatchObject({
      kind: 'callout', styleId: 'leader-line', startTime: 3, endTime: 8, anchor: 'top',
      content: { title: 'Hello', subtitle: 'World' },
      binding: { kind: 'geographic', lngLat: [-9.14, 38.72], altitude: 0 },
      linkTitleToLocation: false,
      locationName: 'Lisbon',
    });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: add callout "Hello"' });
  });

  it('add_callout validates settings against the style', async () => {
    const bad = resultJson(await runAgentTool('add_callout', { title: 'Bad', location: [1, 2], settings: { pulse: 'yes' } }));
    expect(bad).toMatchObject({ error: 'invalid_settings', message: expect.stringMatching(/^settings are not valid for style "leader-line": pulse: /) });

    const ok = resultJson<{ created: { id: string } }>(await runAgentTool('add_callout', { title: 'Good', location: [1, 2], settings: { pulse: true } }));
    expect(useProjectStore.getState().items[ok.created.id]).toMatchObject({ settings: { pulse: true, lineWidth: 1.5 } });
  });

  it('add_callout sizes the callout, with map sizing based on the current map zoom', async () => {
    setAgentMapRef({ current: { getMap: () => ({ getZoom: () => 15.25 }) } } as never);
    const plain = resultJson<{ created: { id: string } }>(await runAgentTool('add_callout', { title: 'Plain', location: [1, 2] }));
    expect(state().items[plain.created.id]).toMatchObject({ scale: 1, sizeMode: 'screen' });

    const sized = resultJson<{ created: { id: string } }>(
      await runAgentTool('add_callout', { title: 'Sized', location: [1, 2], scale: 1.5, sizeMode: 'map' }),
    );
    expect(state().items[sized.created.id]).toMatchObject({ scale: 1.5, sizeMode: 'map', referenceZoom: 15.25 });
  });

  it('add_callout uses the default reference zoom without a map, and rejects bad sizes', async () => {
    const created = resultJson<{ created: { id: string } }>(await runAgentTool('add_callout', { title: 'x', location: [1, 2], sizeMode: 'map' }));
    expect(state().items[created.created.id]).toMatchObject({ sizeMode: 'map', referenceZoom: 12 });
    expect((await runAgentTool('add_callout', { title: 'x', location: [1, 2], scale: 0 })).isError).toBe(true);
    expect((await runAgentTool('add_callout', { title: 'x', location: [1, 2], sizeMode: 'nope' })).isError).toBe(true);
  });

  it('add_callout rejects unknown styles and invalid settings', async () => {
    const unknown = await runAgentTool('add_callout', { title: 'x', location: [0, 0], styleId: 'nope' });
    expect(resultJson<{ error: string; available: string[] }>(unknown)).toMatchObject({ error: 'unknown_style' });
    const badSettings = await runAgentTool('add_callout', { title: 'x', location: [0, 0], settings: { definitelyNot: 1, accentColor: 5 } });
    expect(badSettings.isError).toBe(true);
    expect(steps()).toBe(0);
  });
});
