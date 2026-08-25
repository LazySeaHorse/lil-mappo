import type { Map as MapboxMap } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import type { BoundaryItem, RouteItem } from '@/store/types';
import { BoundaryRenderer } from './runtime/BoundaryRenderer';
import { RouteRenderer } from './runtime/RouteRenderer';

interface LayerDefinition {
  id: string;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
}

class MapboxStyleDouble {
  readonly layers = new Map<string, LayerDefinition>();
  readonly sources = new Map<string, { type: 'geojson'; setData: ReturnType<typeof vi.fn> }>();

  readonly setPaintProperty = vi.fn();
  readonly setLayoutProperty = vi.fn();

  getLayer(id: string) {
    return this.layers.get(id);
  }

  addLayer(layer: LayerDefinition) {
    this.layers.set(layer.id, layer);
  }

  removeLayer(id: string) {
    this.layers.delete(id);
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  addSource(id: string) {
    this.sources.set(id, { type: 'geojson', setData: vi.fn() });
  }

  removeSource(id: string) {
    this.sources.delete(id);
  }
}

function asMap(map: MapboxStyleDouble): MapboxMap {
  return map as unknown as MapboxMap;
}

const route: RouteItem = {
  kind: 'route',
  id: 'flight-route',
  name: 'Configured flight',
  geojson: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    }],
  },
  startTime: 0,
  endTime: 5,
  style: {
    color: '#123456',
    width: 4,
    glow: true,
    glowColor: '#abcdef',
    glowWidth: 18,
    trailFade: false,
    trailFadeLength: 0.3,
    dashPattern: null,
    animationType: 'draw',
  },
  easing: 'linear',
  calculation: {
    mode: 'flight',
    startPoint: [0, 0],
    endPoint: [1, 1],
  },
};

const boundary: BoundaryItem = {
  kind: 'boundary',
  id: 'styled-boundary',
  placeName: 'Styled boundary',
  geojson: {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  },
  resolveStatus: 'resolved',
  startTime: 0,
  endTime: 5,
  style: {
    strokeColor: '#111111',
    fillColor: '#eeeeee',
    strokeWidth: 4,
    glow: true,
    fillOpacity: 0.2,
    animateStroke: false,
    animationStyle: 'fade',
    traceLength: 0.1,
  },
  easing: 'linear',
};

describe('Mapbox layer style contracts', () => {
  it('initializes a flight route from its configured line and glow style', () => {
    const map = new MapboxStyleDouble();
    const renderer = new RouteRenderer(asMap(map), route);
    renderer.mount();
    renderer.render(0);

    expect(map.layers.get('route-layer-flight-route')?.paint).toMatchObject({
      'line-color': '#123456',
      'line-width': 4,
    });
    expect(map.layers.get('route-glow-layer-flight-route')?.paint).toMatchObject({
      'line-color': '#abcdef',
      'line-width': 18,
      'line-blur': 9,
    });

    renderer.dispose();
  });

  it('owns vehicle resources as part of the route lifecycle', () => {
    const map = new MapboxStyleDouble();
    const routeWithVehicle: RouteItem = {
      ...route,
      calculation: {
        ...route.calculation!,
        vehicle: { enabled: true, type: 'dot', modelId: 'dot', scale: 1 },
      },
    };
    const renderer = new RouteRenderer(asMap(map), routeWithVehicle);
    renderer.mount();
    renderer.render(0);

    expect(map.layers.get('vehicle-layer-flight-route')).toMatchObject({
      type: 'circle',
      source: 'vehicle-source-flight-route',
    });
    expect(map.sources.has('vehicle-source-flight-route')).toBe(true);

    renderer.dispose();

    expect(map.layers.has('vehicle-layer-flight-route')).toBe(false);
    expect(map.sources.has('vehicle-source-flight-route')).toBe(false);
  });

  it('initializes and updates a boundary using its independent fill color', () => {
    const map = new MapboxStyleDouble();
    const renderer = new BoundaryRenderer(asMap(map), boundary);
    renderer.mount();
    renderer.render(0);

    expect(map.layers.get('boundary-fill-layer-styled-boundary')?.paint).toMatchObject({
      'fill-color': '#eeeeee',
    });

    renderer.setBoundary({ ...boundary, style: { ...boundary.style, fillColor: '#fedcba' } });
    renderer.render(0);

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'boundary-fill-layer-styled-boundary',
      'fill-color',
      '#fedcba',
    );

    renderer.dispose();
  });
});
