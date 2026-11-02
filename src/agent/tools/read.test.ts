import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { MAP_STYLES } from '@/config/mapbox';
import { createBoundaryItem, createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { runAgentTool } from '../runner';
import { resetAgentTestState, resultJson, resultText } from '../testHelpers';

function bigLine(points: number): GeoJSON.LineString {
  return {
    type: 'LineString',
    coordinates: Array.from({ length: points }, (_, i) => [i * 0.001, 10 + Math.sin(i / 100)]),
  };
}

describe('read tools', () => {
  beforeEach(resetAgentTestState);
  afterEach(() => vi.unstubAllGlobals());

  it('get_guide lists real map styles, callout styles and easings', async () => {
    const text = resultText(await runAgentTool('get_guide', {}));
    for (const key of Object.keys(MAP_STYLES)) expect(text).toContain(key);
    expect(text).toContain('leader-line');
    expect(text).toContain('easeInOutCubic');
    expect(text).toContain('[longitude, latitude]');
    expect(text).toContain('sizeMode');
  });

  it('get_guide tells agents when to pass a year to add_boundary', async () => {
    const text = resultText(await runAgentTool('get_guide', {}));
    expect(text).toMatch(/year parameter for historical or documentary requests/);
    expect(text).toContain('-44');
    expect(text).toMatch(/approximate/);
  });

  it('boundary reads name the period and source of a historical boundary only', async () => {
    const ring: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const store = useProjectStore.getState();
    const versions = [
      { osmId: 'R1', startDate: '1701', endDate: '1867' },
      { osmId: 'R2', startDate: '1867', endDate: '1876' },
    ];
    const historical = createBoundaryItem({
      placeName: 'Kingdom of Prussia', geojson: ring, startTime: 0,
      source: { provider: 'ohm', osmId: 'R2', wikidata: 'Q27306', startDate: '1867', endDate: '1876', versions },
    });
    const present = createBoundaryItem({ placeName: 'Portugal', geojson: ring, startTime: 0 });
    store.addItem(historical);
    store.addItem(present);

    const project = resultJson<{ items: Record<string, unknown>[] }>(await runAgentTool('get_project', {}));
    expect(project.items.find((i) => i.id === historical.id)?.historical).toEqual({ period: '1867–1876', source: 'OpenHistoricalMap' });
    expect(project.items.find((i) => i.id === present.id)).not.toHaveProperty('historical');

    const detail = resultJson<{ historical: unknown }>(await runAgentTool('get_item', { id: historical.id }));
    expect(detail.historical).toEqual({ period: '1867–1876', source: 'OpenHistoricalMap', allPeriods: ['1701–1867', '1867–1876'] });
    expect(resultJson(await runAgentTool('get_item', { id: present.id }))).not.toHaveProperty('historical');
  });

  it('get_project stays compact with a huge route and boundary geometry', async () => {
    const store = useProjectStore.getState();
    store.addItem(createEndpointRouteItem({
      mode: 'car', geojson: wrapGeometry(bigLine(50_000)), start: [0, 10], end: [50, 10], name: 'Long drive', startTime: 1,
    }));
    const ring = bigLine(20_000).coordinates.concat([[0, 10]]);
    store.addItem(createBoundaryItem({
      placeName: 'Bigland', geojson: { type: 'Polygon', coordinates: [ring] }, startTime: 0,
    }));

    const result = await runAgentTool('get_project', {});
    const text = resultText(result);
    expect(text.length).toBeLessThan(6_000);
    const body = resultJson<{ items: Record<string, unknown>[]; duration: number }>(result);
    expect(body.duration).toBe(30);
    const route = body.items.find((i) => i.kind === 'route')!;
    expect(route.geometry).toMatchObject({ pointCount: 50_000, types: ['LineString'] });
    expect((route.geometry as { bbox: number[] }).bbox).toHaveLength(4);
    expect(route.name).toBe('Long drive');
    expect(body.items.some((i) => i.kind === 'camera')).toBe(true);
    expect(text).not.toContain('coordinates');
  });

  it('get_item returns detail and only includes raw geometry on request', async () => {
    const route = createEndpointRouteItem({
      mode: 'flight', geojson: wrapGeometry(bigLine(10)), start: [0, 10], end: [1, 10], name: 'Hop', startTime: 0,
    });
    useProjectStore.getState().addItem(route);
    const plain = resultJson<Record<string, unknown>>(await runAgentTool('get_item', { id: route.id }));
    expect(plain.style).toMatchObject({ color: '#f59e0b' });
    expect(plain.geojson).toBeUndefined();
    const full = resultJson<Record<string, unknown>>(await runAgentTool('get_item', { id: route.id, includeGeometry: true }));
    expect(full.geojson).toBeDefined();

    const missing = await runAgentTool('get_item', { id: 'nope' });
    expect(missing.isError).toBe(true);
    expect(resultJson(missing).error).toBe('item_not_found');
  });

  it('search_place maps Mapbox geocoding features and biases to map center', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      features: [{
        geometry: { coordinates: [2.35, 48.85] },
        bbox: [2.2, 48.8, 2.5, 48.9],
        properties: { name: 'Paris', place_formatted: 'France', full_address: 'Paris, France' },
      }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    useProjectStore.setState({ mapCenter: [10, 20] });
    const body = resultJson<{ results: unknown[] }>(await runAgentTool('search_place', { query: 'Paris' }));
    expect(body.results).toEqual([{
      name: 'Paris', fullName: 'Paris, France', coordinates: [2.35, 48.85], bbox: [2.2, 48.8, 2.5, 48.9],
    }]);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('geocode/v6/forward');
    expect(url).toContain('proximity=10%2C20');
  });
});
