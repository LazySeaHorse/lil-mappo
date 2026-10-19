import greatCircle from '@turf/great-circle';
import { point } from '@turf/helpers';
import { describe, expect, it } from 'vitest';
import { calculateBearing, extractLineCoords } from '@/engine/geoUtils';
import { getRoutePath } from '@/engine/routePath';
import { calculateFlightArc } from '@/services/flightPath';
import type { RouteItem } from '@/store/types';
import { RouteRenderer } from './RouteRenderer';
import { createModelLayerMap } from './testMapboxModelLayer';

/**
 * A plane on a flight route must face the way the drawn route is going, whatever the route's
 * length, how close it is to either end, how large the marker is, and however an older project
 * stored the flight (altitude on each vertex, split at the antimeridian).
 */

function flight(geometry: GeoJSON.Geometry, scale: number): RouteItem {
  return {
    kind: 'route',
    id: 'f',
    name: 'Flight',
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] },
    startTime: 0,
    endTime: 100,
    style: { color: '#f00', width: 4, glow: false, glowWidth: 10, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
    easing: 'linear',
    exitAnimation: 'none',
    calculation: { mode: 'flight', startPoint: [0, 0], endPoint: [1, 1], startName: '', endName: '', vehicle: { enabled: true, type: 'plane', modelId: '', scale } },
  } as unknown as RouteItem;
}

/**
 * The plane's rotation (roll, pitch, heading) at route progress `u`: the orientation the renderer
 * gives its model, checked to be the heading Mapbox's own math draws on the globe.
 */
function rotationAt(route: RouteItem, u: number): number[] {
  const setup = createModelLayerMap();
  const renderer = new RouteRenderer(setup.map, route);
  renderer.mount();
  renderer.render(u * 100);
  const models = setup.sources.get(`vehicle-source-${route.id}`)?.models;
  const orientation = models?.vehicle.orientation as number[];
  const drawn = setup.drawnHeading(`vehicle-layer-${route.id}`, 'globe')!;
  expect(apart(drawn, orientation[2])).toBeLessThan(1e-6);
  renderer.dispose();
  return orientation;
}

/** The route's own direction at `u`: the bearing across 40 m of it. */
function routeBearing(route: RouteItem, u: number): number {
  const path = getRoutePath(extractLineCoords(route.geojson));
  const e = 20 / path.lengthM;
  return calculateBearing(path.pointAt(Math.max(0, u - e)), path.pointAt(Math.min(1, u + e)));
}

const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

const ROUTES: Record<string, [[number, number], [number, number]]> = {
  'London to New York (5,500 km)': [[-0.45, 51.47], [-73.78, 40.64]],
  'Tokyo to San Francisco, across the antimeridian': [[139.78, 35.55], [-122.4, 37.6]],
  'Sydney to Los Angeles, southern hemisphere': [[151.2, -33.9], [-118.4, 33.9]],
  'Fiji to Honolulu, across the antimeridian eastward': [[178.4, -18], [-157.9, 21.3]],
  'a 24 km hop': [[-0.45, 51.47], [-0.1, 51.5]],
};

describe('a plane on a flight route faces along the route', () => {
  describe.each(Object.entries(ROUTES))('%s', (_name, [from, to]) => {
    const geometry = calculateFlightArc(from, to);

    it.each([1, 4])('at %ix size, all the way along, including both ends', (scale) => {
      const route = flight(geometry, scale);
      for (const u of [0, 0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999, 1]) {
        const [roll, pitch, bearing] = rotationAt(route, u);
        expect(apart(bearing, routeBearing(route, u))).toBeLessThan(1);
        expect(Math.abs(pitch)).toBe(0);
        expect(roll).toBe(0);
      }
    });

    it('at the largest size (190 km long), still along the route away from its ends', () => {
      const route = flight(geometry, 50);
      for (const u of [0.25, 0.5, 0.75]) expect(apart(rotationAt(route, u)[2], routeBearing(route, u))).toBeLessThan(3);
    });
  });

  it('turns smoothly the whole way: no frame swings round by more than the route turns', () => {
    const route = flight(calculateFlightArc([-0.45, 51.47], [-73.78, 40.64]), 1);
    let last = rotationAt(route, 0)[2];
    for (let k = 1; k <= 200; k++) {
      const bearing = rotationAt(route, k / 200)[2];
      expect(apart(bearing, last)).toBeLessThan(2);
      last = bearing;
    }
  });

  it('faces the same way for a flight saved by an older version: altitude on every vertex, split at the antimeridian', () => {
    // How older versions stored a flight: Turf's great circle, split in two where it crosses the
    // antimeridian, with a 50 km hump of altitude added to each vertex.
    const arc = greatCircle(point([139.78, 35.55]), point([-122.4, 37.6]), { npoints: 100 }).geometry;
    expect(arc.type).toBe('MultiLineString');
    const lines = (arc as GeoJSON.MultiLineString).coordinates;
    const total = lines.reduce((n, l) => n + l.length, 0);
    let index = 0;
    const legacy: GeoJSON.MultiLineString = {
      type: 'MultiLineString',
      coordinates: lines.map((line) => line.map(([lng, lat]) => [lng, lat, 50000 * Math.sin((Math.PI * index++) / (total - 1))])),
    };
    for (const scale of [1, 4]) {
      const route = flight(legacy, scale);
      for (const u of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
        const [roll, pitch, bearing] = rotationAt(route, u);
        expect(apart(bearing, routeBearing(route, u))).toBeLessThan(1);
        // The plane rides the ground: it is not nosed up or down by the altitude it never gains.
        expect(Math.abs(pitch)).toBe(0);
        expect(roll).toBe(0);
      }
    }
  });

  it('faces along a short old flight, hump and all, instead of nosing into the sky', () => {
    // A 500 km flight with a 50 km hump climbs at up to 17 degrees.
    const route = flight({
      type: 'LineString',
      coordinates: Array.from({ length: 100 }, (_, i) => [i * 0.045, 0, 50000 * Math.sin((Math.PI * i) / 99)]),
    }, 1);
    for (const u of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const [, pitch, bearing] = rotationAt(route, u);
      expect(pitch).toBe(0);
      expect(bearing).toBeCloseTo(90, 0);
    }
  });

  it('faces along a route shorter than the plane (a 4 km flight, the plane 3.7 km at 1x, 190 km at 50x)', () => {
    const route = flight({ type: 'LineString', coordinates: [[0, 0], [0.02, 0.02], [0.04, 0.0401]] }, 1);
    for (const u of [0, 0.5, 1]) expect(Number.isFinite(rotationAt(route, u)[2])).toBe(true);
    const big = flight({ type: 'LineString', coordinates: [[0, 0], [0.04, 0]] }, 50);
    for (const u of [0, 0.5, 1]) expect(rotationAt(big, u)[2]).toBeCloseTo(90, 3);
  });
});
