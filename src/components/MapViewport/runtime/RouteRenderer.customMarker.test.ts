import type { Map as MapboxMap } from 'mapbox-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelAsset, RouteItem, RouteVehicleConfig } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { ModelCatalog, mapboxModelId } from './ModelCatalog';
import { RouteRenderer } from './RouteRenderer';
import { createMapboxModels } from './testMapboxModels';

type Layer = { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> };

function createMapDouble() {
  const layers = new Map<string, Layer>();
  const sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();
  const mapbox = createMapboxModels();
  const map = {
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: Layer) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getLayoutProperty: vi.fn((id: string, prop: string) => layers.get(id)?.layout?.[prop]),
    setLayoutProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) l.layout = { ...(l.layout || {}), [prop]: val };
    }),
    setPaintProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) l.paint = { ...(l.paint || {}), [prop]: val };
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { type: 'geojson', setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    ...mapbox.api,
  };
  return { map: map as unknown as MapboxMap, layers, sources, mapbox };
}

const SHA = 'd'.repeat(64);
const bus: ModelAsset = {
  id: 'bus', fileName: 'bus.glb', byteSize: 10, sha256: SHA,
  bounds: { min: [-1, -0.5, -6], max: [1, 3, 6] },
};

function route(vehicle: RouteVehicleConfig): RouteItem {
  return {
    kind: 'route',
    id: 'r1',
    name: 'Bus',
    geojson: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0], [0.02, 0]] } }],
    },
    startTime: 0,
    endTime: 10,
    style: { color: '#3b82f6', width: 3, glow: false, glowWidth: 6, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
    easing: 'linear',
    exitAnimation: 'none',
    calculation: { mode: 'car', startPoint: [0, 0], endPoint: [0.02, 0], startName: '', endName: '', vehicle },
  };
}

const custom: RouteVehicleConfig = { enabled: true, type: 'custom', modelId: 'bus', scale: 2 };

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:bus'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
});

afterEach(() => vi.unstubAllGlobals());

describe('RouteRenderer with a custom marker', () => {
  it('rides the imported model, standing on the route, at its size', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers, sources, mapbox } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom), new ModelCatalog(map, () => ({ bus })));
    renderer.mount();

    const layer = layers.get('vehicle-layer-r1')!;
    expect(layer.type).toBe('model');
    expect(layer.layout?.['model-id']).toBe(mapboxModelId(SHA));
    expect(mapbox.requested.get(mapboxModelId(SHA))).toBe('blob:bus');
    expect(layer.paint?.['model-scale']).toEqual([2, 2, 2]);
    // Lifted by the 0.5 m it reaches below its origin, at 2x.
    expect(layer.paint?.['model-translation']).toEqual([0, 0, 1]);

    renderer.render(5);
    const sent = sources.get('vehicle-source-r1')!.setData.mock.lastCall![0] as GeoJSON.Feature;
    const rotation = sent.properties?.rotation as number[];
    expect(rotation[2]).toBeCloseTo(90, 0); // heading east along the route
  });

  it('falls back to the dot while the model file is missing (reloaded project, cloud render)', () => {
    const { map, layers, mapbox } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom), new ModelCatalog(map, () => ({ bus })));
    renderer.mount();
    expect(() => renderer.render(5)).not.toThrow();
    expect(layers.get('vehicle-layer-r1')!.type).toBe('circle');
    expect(mapbox.requested.size).toBe(0);
  });

  it('falls back to the dot when the project has no such model at all', () => {
    const { map, layers } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom));
    renderer.mount();
    expect(() => renderer.render(5)).not.toThrow();
    expect(layers.get('vehicle-layer-r1')!.type).toBe('circle');
  });

  it('switches from the dot to the model when the file is relinked', () => {
    const { map, layers } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom), new ModelCatalog(map, () => ({ bus })));
    renderer.mount();
    registerModelBytes(SHA, new ArrayBuffer(8));
    renderer.refreshModels();
    expect(layers.get('vehicle-layer-r1')!.type).toBe('model');
  });

  it('goes back to the built-in models without the custom lift', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const { map, layers } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom), new ModelCatalog(map, () => ({ bus })));
    renderer.mount();
    renderer.setRoute(route({ enabled: true, type: 'car', modelId: '', scale: 1 }));
    const layer = layers.get('vehicle-layer-r1')!;
    expect(layer.layout?.['model-id']).toBe('car');
    expect(layer.paint?.['model-translation']).toEqual([0, 0, 0]);
  });
});
