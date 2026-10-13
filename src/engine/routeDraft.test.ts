import { describe, expect, it } from 'vitest';
import { routeDraftChanged, routeSummary } from './routeDraft';
import { convertRouteCalculation } from './routeMode';
import type { EndpointRouteCalculation, RouteCalculation, WalkRouteCalculation } from '@/store/types';

const line = (coords: number[][]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
});
const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const car: EndpointRouteCalculation = {
  mode: 'car', startPoint: [-73.99785, 40.71234], endPoint: [-73.96542, 40.78243], startName: 'Brooklyn Bridge', endName: 'Central Park',
};

describe('routeSummary', () => {
  it('shows the mode and the place names of a car route', () => {
    expect(routeSummary({ calculation: car, geojson: empty })).toBe('Car · Brooklyn Bridge → Central Park');
  });

  it('shows a flight the same way', () => {
    expect(routeSummary({ calculation: { ...car, mode: 'flight', startName: 'JFK', endName: 'LHR' }, geojson: empty }))
      .toBe('Flight · JFK → LHR');
  });

  it('falls back to formatted coordinates when a name is unknown', () => {
    expect(routeSummary({ calculation: { ...car, startName: '' }, geojson: empty })).toBe('Car · -73.99785, 40.71234 → Central Park');
  });

  it('says so when a place is not set', () => {
    expect(routeSummary({ calculation: { ...car, endPoint: [0, 0], endName: '' }, geojson: empty })).toBe('Car · Brooklyn Bridge → not set');
    expect(routeSummary({ calculation: { ...car, startPoint: [0, 0], startName: '', endPoint: [0, 0], endName: '' }, geojson: empty }))
      .toBe('Car · No places set');
  });

  it('shows the point count and the distance of a walk', () => {
    const walk: WalkRouteCalculation = { mode: 'walk', points: [[0, 0.1], [0, 0.2], [0, 0.3]], curved: false, sharpness: 0.85 };
    expect(routeSummary({ calculation: walk, geojson: line([[0, 0.1], [0, 0.3]]) })).toBe('Walk · 3 points · 22.2 km');
  });

  it('handles an empty or a one point walk', () => {
    const walk: WalkRouteCalculation = { mode: 'walk', points: [], curved: false, sharpness: 0.85 };
    expect(routeSummary({ calculation: walk, geojson: empty })).toBe('Walk · No points yet');
    expect(routeSummary({ calculation: { ...walk, points: [[1, 1]] }, geojson: empty })).toBe('Walk · 1 point');
  });

  it('shows short distances in meters', () => {
    const walk: WalkRouteCalculation = { mode: 'walk', points: [[0, 0.001], [0, 0.002]], curved: false, sharpness: 0.85 };
    expect(routeSummary({ calculation: walk, geojson: line([[0, 0.001], [0, 0.002]]) })).toBe('Walk · 2 points · 111 m');
  });

  it('describes a route with no calculation as an imported path', () => {
    expect(routeSummary({ geojson: line([[0, 0.1], [0, 0.3]]) })).toBe('Imported path · 22.2 km');
    expect(routeSummary({ geojson: empty })).toBe('Imported path');
  });
});

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
