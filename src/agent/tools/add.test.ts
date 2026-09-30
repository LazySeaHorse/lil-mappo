import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import { undo, redo } from '@/store/history';
import { agentEvents } from '../events';
import { runAgentTool } from '../runner';
import { setAgentMapRef } from '../mapRef';
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
          type: 'Feature', properties: { display_name: 'Portugal, Europe', type: 'administrative' },
          geometry: { type: 'Polygon', coordinates: [[[-9, 37], [-6, 37], [-6, 42], [-9, 42], [-9, 37]]] },
        }],
      }));
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('add tools', () => {
  beforeEach(() => {
    resetAgentTestState();
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

  it('add_route flight from coordinates uses a great-circle arc and plane vehicle', async () => {
    const result = await runAgentTool('add_route', { mode: 'flight', from: [-9.14, 38.72], to: [2.35, 48.85] });
    const { created } = resultJson<{ created: { id: string } }>(result);
    const route = state().items[created.id];
    expect(route.kind === 'route' && route.calculation).toMatchObject({ mode: 'flight', vehicle: { type: 'plane' } });
    expect(route.kind === 'route' && route.endTime).toBe(5);
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
    expect(item).toMatchObject({ kind: 'boundary', resolveStatus: 'resolved', startTime: 1, endTime: 6, style: { strokeColor: '#00ff00', animationStyle: 'trace', fillOpacity: 0.1 } });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: add boundary "Portugal"' });
  });

  it('add_boundary reports when nothing matches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }))));
    const result = await runAgentTool('add_boundary', { query: 'Nowhereland' });
    expect(resultJson(result).error).toBe('boundary_not_found');
    expect(steps()).toBe(0);
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
    });
    expect(steps()).toBe(1);
    expect(historyPast()[0]).toMatchObject({ source: 'ai', label: 'AI: add callout "Hello"' });
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
