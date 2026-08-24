import type { MutableRefObject } from 'react';
import { render } from '@testing-library/react';
import type { MapRef } from 'react-map-gl/mapbox';
import { describe, expect, it, vi } from 'vitest';
import type { BoundaryItem, RouteItem } from '@/store/types';
import { BoundaryLayerGroup } from './BoundaryLayerGroup';
import { RouteLayerGroup } from './RouteLayerGroup';

interface LayerDefinition {
  id: string;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
}

class MapboxStyleDouble {
  readonly layers = new Map<string, LayerDefinition>();
  readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();

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
    this.sources.set(id, { setData: vi.fn() });
  }

  removeSource(id: string) {
    this.sources.delete(id);
  }
}

function createMapRef(map: MapboxStyleDouble): MutableRefObject<MapRef | null> {
  return {
    current: { getMap: () => map } as unknown as MapRef,
  };
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
    const view = render(
      <RouteLayerGroup route={route} mapRef={createMapRef(map)} styleLoaded />,
    );

    expect(map.layers.get('route-layer-flight-route')?.paint).toMatchObject({
      'line-color': '#123456',
      'line-width': 4,
    });
    expect(map.layers.get('route-glow-layer-flight-route')?.paint).toMatchObject({
      'line-color': '#abcdef',
      'line-width': 18,
      'line-blur': 9,
    });

    view.unmount();
  });

  it('initializes and updates a boundary using its independent fill color', () => {
    const map = new MapboxStyleDouble();
    const mapRef = createMapRef(map);
    const view = render(
      <BoundaryLayerGroup boundary={boundary} mapRef={mapRef} styleLoaded />,
    );

    expect(map.layers.get('boundary-fill-layer-styled-boundary')?.paint).toMatchObject({
      'fill-color': '#eeeeee',
    });

    view.rerender(
      <BoundaryLayerGroup
        boundary={{ ...boundary, style: { ...boundary.style, fillColor: '#fedcba' } }}
        mapRef={mapRef}
        styleLoaded
      />,
    );

    expect(map.setPaintProperty).toHaveBeenCalledWith(
      'boundary-fill-layer-styled-boundary',
      'fill-color',
      '#fedcba',
    );

    view.unmount();
  });
});
