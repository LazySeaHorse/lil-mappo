import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveRoutePaint,
} from '@/components/MapViewport/layerStyleContracts';
import type {
  RouteItem,
  RouteMode,
  RouteStyle,
} from './types';
import { useProjectStore } from './useProjectStore';
import { convertRouteCalculation } from '@/engine/routeMode';

const ROUTE_MODES = {
  car: true,
  walk: true,
  flight: true,
} satisfies Record<RouteMode, true>;

const routeStyle: RouteStyle = {
  color: '#123456',
  width: 4,
  glow: true,
  glowWidth: 18,
  dashPattern: null,
  animationType: 'draw',
  cometTrailLength: 0.2,
};

function createRoute(mode: RouteMode): RouteItem {
  return {
    kind: 'route',
    id: `route-${mode}`,
    name: `${mode} route`,
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
    style: routeStyle,
    easing: 'linear', exitAnimation: 'none',
    calculation: convertRouteCalculation({ mode: 'car', startPoint: [0, 0], endPoint: [1, 1], startName: '', endName: '' }, mode),
  };
}

describe('canonical domain contracts', () => {
  afterEach(() => {
    useProjectStore.getState().setIsCameraEnabled(true);
  });

  it('keeps every supported route mode in the canonical union', () => {
    expect(Object.keys(ROUTE_MODES)).toEqual(['car', 'walk', 'flight']);
    for (const mode of Object.keys(ROUTE_MODES) as RouteMode[]) {
      expect(createRoute(mode).calculation?.mode).toBe(mode);
    }
  });

  it('uses configured route colors and glow dimensions even for flights', () => {
    const paint = resolveRoutePaint(createRoute('flight'));

    expect(paint).toEqual({
      lineColor: '#123456',
      glowWidth: 18,
      glowBlur: 9,
    });
  });

  it('updates camera enablement through the declared store action', () => {
    const store = useProjectStore.getState();

    store.setIsCameraEnabled(false);
    expect(useProjectStore.getState().isCameraEnabled).toBe(false);

    useProjectStore.getState().setIsCameraEnabled(true);
    expect(useProjectStore.getState().isCameraEnabled).toBe(true);
  });
});
