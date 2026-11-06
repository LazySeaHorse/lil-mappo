import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelAsset, RouteItem, RouteVehicleConfig } from '@/store/types';
import { clearModelRegistry, registerModelBytes } from '@/models/modelRegistry';
import { setVehicleModelLoading, useVehicleLoading } from '@/models/vehicleLoading';
import { ModelCatalog } from './ModelCatalog';
import { RouteRenderer } from './RouteRenderer';
import { createModelLayerMap } from './testMapboxModelLayer';

function route(vehicle: RouteVehicleConfig): RouteItem {
  return {
    kind: 'route',
    id: 'r1',
    name: 'Drive',
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

const marker = (type: RouteVehicleConfig['type']): RouteVehicleConfig => ({ enabled: true, type, modelId: '', scale: 1 });
const loading = () => useVehicleLoading.getState().routeIds.has('r1');

function mounted(vehicle: RouteVehicleConfig) {
  const setup = createModelLayerMap();
  const renderer = new RouteRenderer(setup.map, route(vehicle));
  renderer.mount();
  return { ...setup, renderer };
}

const SHA = 'd'.repeat(64);
const bus: ModelAsset = { id: 'bus', fileName: 'bus.glb', byteSize: 10, sha256: SHA, bounds: { min: [-1, -0.5, -6], max: [1, 3, 6] } };

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:bus'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setVehicleModelLoading('r1', false);
});

describe('RouteRenderer marker model loading', () => {
  it.each(['car', 'plane'] as const)('is loading from the %s source being added until it reports its data', (type) => {
    const { sources } = mounted(marker(type));
    expect(loading()).toBe(true);
    sources.get('vehicle-source-r1')!.fire!('data');
    expect(loading()).toBe(false);
  });

  it('stops loading when the model fails to load', () => {
    const { sources } = mounted(marker('car'));
    sources.get('vehicle-source-r1')!.fire!('error');
    expect(loading()).toBe(false);
  });

  it('is not loading for a dot', () => {
    mounted(marker('dot'));
    expect(loading()).toBe(false);
  });

  it('stops loading when the marker goes, or becomes a dot', () => {
    const { renderer } = mounted(marker('plane'));
    renderer.setRoute(route({ ...marker('plane'), enabled: false }));
    expect(loading()).toBe(false);

    renderer.setRoute(route(marker('car')));
    expect(loading()).toBe(true);
    renderer.setRoute(route(marker('dot')));
    expect(loading()).toBe(false);
  });

  it('stops loading on dispose', () => {
    const { renderer } = mounted(marker('car'));
    renderer.dispose();
    expect(loading()).toBe(false);
  });

  it('starts over for a replaced model, and ignores the old source', () => {
    const { renderer, sources } = mounted(marker('car'));
    const car = sources.get('vehicle-source-r1')!;
    car.fire!('data');
    renderer.setRoute(route(marker('plane')));
    expect(loading()).toBe(true);

    // A late event from the source that was replaced does not end the new one's wait.
    car.fire!('data');
    expect(loading()).toBe(true);
    sources.get('vehicle-source-r1')!.fire!('data');
    expect(loading()).toBe(false);
  });

  it('does not clear the wait when the scale changes while loading', () => {
    const { renderer, sources } = mounted(marker('car'));
    renderer.setRoute(route({ ...marker('car'), scale: 2 }));
    expect(loading()).toBe(true);
    sources.get('vehicle-source-r1')!.fire!('data');
    expect(loading()).toBe(false);
  });

  it('is not loading for an imported model marker', () => {
    registerModelBytes(SHA, new ArrayBuffer(8));
    const setup = createModelLayerMap();
    new RouteRenderer(setup.map, route({ enabled: true, type: 'custom', modelId: 'bus', scale: 1 }), new ModelCatalog(setup.map, () => ({ bus }))).mount();
    expect(setup.layers.get('vehicle-layer-r1')!.type).toBe('model');
    expect(loading()).toBe(false);
  });
});
