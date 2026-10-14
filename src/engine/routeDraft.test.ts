import { describe, expect, it } from 'vitest';
import { editableKey, routeDraftChanged } from './routeDraft';
import { convertRouteCalculation } from './routeMode';
import type { EndpointRouteCalculation, RouteCalculation } from '@/store/types';

const car: EndpointRouteCalculation = {
  mode: 'car', startPoint: [-73.99785, 40.71234], endPoint: [-73.96542, 40.78243], startName: 'Brooklyn Bridge', endName: 'Central Park',
};

describe('routeDraftChanged', () => {
  it('is false for a copy of the saved calculation', () => {
    expect(routeDraftChanged(car, structuredClone(car))).toBe(false);
  });

  it('is true when an endpoint, a name or the mode changes', () => {
    expect(routeDraftChanged(car, { ...car, endPoint: [1, 1] })).toBe(true);
    expect(routeDraftChanged(car, { ...car, endName: 'Other' })).toBe(true);
    expect(routeDraftChanged(car, convertRouteCalculation(car, 'flight'))).toBe(true);
  });

  it('is true when walk points or curve settings change', () => {
    const walk: RouteCalculation = { mode: 'walk', points: [[0, 0], [1, 1]], curved: true, sharpness: 0.85 };
    expect(routeDraftChanged(walk, { ...walk, points: [[0, 0], [1, 1], [2, 2]] })).toBe(true);
    expect(routeDraftChanged(walk, { ...walk, curved: false })).toBe(true);
    expect(routeDraftChanged(walk, { ...walk, sharpness: 0.5 })).toBe(true);
  });

  it('ignores the marker, which the path editor does not change', () => {
    const vehicle = { enabled: true, type: 'car' as const, modelId: '', scale: 2 };
    expect(routeDraftChanged(car, { ...car, vehicle })).toBe(false);
  });

  it('treats a route with no calculation as an unset car route', () => {
    expect(routeDraftChanged(undefined, convertRouteCalculation(undefined, 'car'))).toBe(false);
    expect(routeDraftChanged(undefined, convertRouteCalculation(undefined, 'walk'))).toBe(true);
  });
});

describe('editableKey', () => {
  it('changes with the points, names and mode, not with the marker', () => {
    expect(editableKey(car)).toBe(editableKey(structuredClone(car)));
    expect(editableKey(car)).not.toBe(editableKey({ ...car, endPoint: [1, 1] }));
    expect(editableKey(car)).toBe(editableKey({ ...car, vehicle: { enabled: true, type: 'car', modelId: '', scale: 2 } }));
  });

  it('treats a route with no calculation as an unset car route', () => {
    expect(editableKey(undefined)).toBe(editableKey(convertRouteCalculation(undefined, 'car')));
  });
});
