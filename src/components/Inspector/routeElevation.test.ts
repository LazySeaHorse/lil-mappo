import { describe, expect, it } from 'vitest';
import { routeElevationProfile } from './routeElevation';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';

const route = (coordinates: number[][]) =>
  createEndpointRouteItem({
    id: 'r', mode: 'car', name: 'R', startTime: 0,
    geojson: wrapGeometry({ type: 'LineString', coordinates }), start: [0, 0], end: [1, 1],
  });

describe('routeElevationProfile', () => {
  it('reads min, max and the sum of uphill steps', () => {
    const p = routeElevationProfile(route([[0, 0, 10], [0, 1, 40], [0, 2, 25], [0, 3, 30]]));
    expect(p).toMatchObject({ min: 10, max: 40, gain: 35 });
  });

  it('has no profile for a 2D route', () => {
    expect(routeElevationProfile(route([[0, 0], [1, 1]]))).toBeNull();
  });

  it('has no profile when any point lacks altitude', () => {
    expect(routeElevationProfile(route([[0, 0, 5], [1, 1], [2, 2, 9]]))).toBeNull();
  });

  it('keeps a route at sea level', () => {
    expect(routeElevationProfile(route([[0, 0, 0], [1, 1, 0]]))).toMatchObject({ min: 0, max: 0, gain: 0 });
  });
});
