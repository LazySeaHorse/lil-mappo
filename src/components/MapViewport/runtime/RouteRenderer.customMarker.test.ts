import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelAsset, RouteItem, RouteVehicleConfig } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { ModelCatalog, mapboxModelId } from './ModelCatalog';
import { RouteRenderer } from './RouteRenderer';
import { createMapboxModels } from './testMapboxModels';
import { createModelLayerMap } from './testMapboxModelLayer';

function createMapDouble() {
  const setup = createModelLayerMap();
  const mapbox = createMapboxModels();
  Object.assign(setup.double, mapbox.api);
  return { ...setup, mapbox };
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
    const { map, layers, sources, mapbox, drawnHeading } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom), new ModelCatalog(map, () => ({ bus })));
    renderer.mount();

    const layer = layers.get('vehicle-layer-r1')!;
    expect(layer.type).toBe('model');
    // Drawn from a model source that loads the imported file's object URL itself.
    expect(sources.get('vehicle-source-r1')!.models?.vehicle.uri).toBe('blob:bus');
    expect(mapbox.requested.get(mapboxModelId(SHA))).toBe('blob:bus');
    expect(layer.paint?.['model-scale']).toEqual([2, 2, 2]);
    // Lifted by the 0.5 m it reaches below its origin, at 2x.
    expect(layer.paint?.['model-translation']).toEqual([0, 0, 1]);

    renderer.render(5);
    expect(sources.get('vehicle-source-r1')!.models?.vehicle.orientation?.[2]).toBeCloseTo(90, 0);
    // Drawn heading east along the route, on the globe as in mercator.
    expect(drawnHeading('vehicle-layer-r1', 'globe')).toBeCloseTo(90, 0);
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
    const { map, layers, sources } = createMapDouble();
    const renderer = new RouteRenderer(map, route(custom), new ModelCatalog(map, () => ({ bus })));
    renderer.mount();
    renderer.setRoute(route({ enabled: true, type: 'car', modelId: '', scale: 1 }));
    const layer = layers.get('vehicle-layer-r1')!;
    expect(sources.get('vehicle-source-r1')!.models?.vehicle.uri).toMatch(/car.*\.glb/);
    expect(layer.paint?.['model-translation']).toEqual([0, 0, 0]);
  });
});
