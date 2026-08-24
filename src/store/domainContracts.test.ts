import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveBoundaryFillColor,
  resolveRoutePaint,
} from '@/components/MapViewport/layerStyleContracts';
import type {
  BoundaryStyle,
  RouteItem,
  RouteMode,
  RouteStyle,
} from './types';
import { useProjectStore } from './useProjectStore';

const ROUTE_MODES = {
  car: true,
  walk: true,
  flight: true,
  manual: true,
} satisfies Record<RouteMode, true>;

const routeStyle: RouteStyle = {
  color: '#123456',
  width: 4,
  glow: true,
  glowColor: '#abcdef',
  glowWidth: 18,
  trailFade: false,
  trailFadeLength: 0.3,
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
    easing: 'linear',
    calculation: {
      mode,
      startPoint: [0, 0],
      endPoint: [1, 1],
    },
  };
}

describe('canonical domain contracts', () => {
  afterEach(() => {
    useProjectStore.getState().setIsCameraEnabled(true);
  });

  it('keeps every supported route mode in the canonical union', () => {
    expect(Object.keys(ROUTE_MODES)).toEqual(['car', 'walk', 'flight', 'manual']);
    for (const mode of Object.keys(ROUTE_MODES) as RouteMode[]) {
      expect(createRoute(mode).calculation?.mode).toBe(mode);
    }
  });

  it('uses configured route colors and glow dimensions even for flights', () => {
    const paint = resolveRoutePaint(createRoute('flight'));

    expect(paint).toEqual({
      lineColor: '#123456',
      glowColor: '#abcdef',
      glowWidth: 18,
      glowBlur: 9,
    });
  });

  it('uses an independent boundary fill color when one is configured', () => {
    const style = {
      strokeColor: '#111111',
      fillColor: '#eeeeee',
    } satisfies Pick<BoundaryStyle, 'strokeColor' | 'fillColor'>;

    expect(resolveBoundaryFillColor(style)).toBe('#eeeeee');
  });

  it('falls back to stroke color for a legacy boundary without fillColor', () => {
    const legacyStyle = {
      strokeColor: '#765432',
    } satisfies Pick<BoundaryStyle, 'strokeColor'>;

    expect(resolveBoundaryFillColor(legacyStyle)).toBe('#765432');
  });

  it('updates camera enablement through the declared store action', () => {
    const store = useProjectStore.getState();

    store.setIsCameraEnabled(false);
    expect(useProjectStore.getState().isCameraEnabled).toBe(false);

    useProjectStore.getState().setIsCameraEnabled(true);
    expect(useProjectStore.getState().isCameraEnabled).toBe(true);
  });
});
