import { describe, it, expect } from 'vitest';
import { truncateCoordinates, optimizeGeometry, truncateCoordinate } from './geoUtils';
import { calculateFlightArc } from '@/services/flightPath';
import { computePhase, computeOpacity } from '@/annotations/animation';
import { getRouteCoords } from './cameraUtils';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem, RouteItem } from '@/store/types';

describe('geoUtils & cameraUtils', () => {
  it('truncates single coordinates correctly', () => {
    expect(truncateCoordinate([12.345678, 98.765432], 4)).toEqual([12.3457, 98.7654]);
    expect(truncateCoordinate([12.345678, 98.765432, 500.123], 4)).toEqual([12.3457, 98.7654, 500.1]);
  });

  it('recursively truncates GeoJSON geometries without breaking structure', () => {
    const polygon: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [10.123456, 20.654321],
          [10.123456, 21.654321],
          [11.123456, 21.654321],
          [10.123456, 20.654321],
        ],
      ],
    };

    const truncated = truncateCoordinates(polygon, 2);
    expect(truncated.type).toBe('Polygon');
    expect(truncated.coordinates[0][0]).toEqual([10.12, 20.65]);
  });

  it('handles GeometryCollection truncation', () => {
    const gc: GeoJSON.GeometryCollection = {
      type: 'GeometryCollection',
      geometries: [
        {
          type: 'Point',
          coordinates: [1.123456, 2.654321],
        },
      ],
    };

    const truncated = truncateCoordinates(gc, 3);
    expect(truncated.geometries[0]).toEqual({
      type: 'Point',
      coordinates: [1.123, 2.654],
    });
  });

  it('optimizes geometry with simplify and precision', () => {
    const line: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [0.00001, 0.00001],
        [0.00002, 0.00002],
        [1.00005, 1.00005],
      ],
    };

    const optimized = optimizeGeometry(line, { simplify: true, tolerance: 0.01, precision: 2 });
    expect(optimized.type).toBe('LineString');
    expect(optimized.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts route coordinates from route items', () => {
    const route: RouteItem = {
      kind: 'route',
      id: 'test-route-1',
      name: 'Test Route',
      startTime: 0,
      endTime: 5,
      easing: 'linear',
      style: {
        color: '#ff0000',
        width: 3,
        glow: false,
        glowColor: '#ff0000',
        glowWidth: 6,
        trailFade: false,
        trailFadeLength: 0.3,
        dashPattern: null,
      },
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
                [2, 2],
              ],
            },
          },
        ],
      },
    };

    useProjectStore.setState({ items: { 'test-route-1': route }, itemOrder: ['test-route-1'] });
    const coords = getRouteCoords('test-route-1');
    expect(coords).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('services/flightPath', () => {
  it('calculates Great Circle arc on globe surface without Z elevation', () => {
    const start: [number, number] = [-74.006, 40.7128]; // NYC
    const end: [number, number] = [2.3522, 48.8566]; // Paris
    const arc = calculateFlightArc(start, end);

    expect(arc.type).toBe('LineString');
    expect(arc.coordinates.length).toBe(100);

    // Coordinates should be 2D [lng, lat] without Z elevation
    for (const coord of arc.coordinates) {
      expect(coord.length).toBe(2);
      expect(coord[2]).toBeUndefined();
    }

    const first = arc.coordinates[0];
    const last = arc.coordinates[arc.coordinates.length - 1];

    expect(first[0]).toBeCloseTo(start[0], 2);
    expect(first[1]).toBeCloseTo(start[1], 2);
    expect(last[0]).toBeCloseTo(end[0], 2);
    expect(last[1]).toBeCloseTo(end[1], 2);
  });

  it('calculates Great Circle arc across the antimeridian as a continuous LineString without Z elevation', () => {
    const sfo: [number, number] = [-122.378955, 37.621313]; // SFO
    const hnd: [number, number] = [139.779839, 35.549393]; // HND (Tokyo)
    const arc = calculateFlightArc(sfo, hnd);

    expect(arc.type).toBe('LineString');
    expect(arc.coordinates.length).toBe(100);

    // Each coordinate should be a valid 2D [lng, lat] tuple of numbers without Z elevation
    for (const coord of arc.coordinates) {
      expect(coord.length).toBe(2);
      expect(coord[2]).toBeUndefined();
      expect(typeof coord[0]).toBe('number');
      expect(typeof coord[1]).toBe('number');
      expect(Array.isArray(coord[0])).toBe(false);
    }

    const first = arc.coordinates[0];
    const last = arc.coordinates[arc.coordinates.length - 1];
    expect(first[0]).toBeCloseTo(sfo[0], 2);
    expect(first[1]).toBeCloseTo(sfo[1], 2);

    // Unwrapped destination longitude (139.78 - 360 = -220.22)
    expect(last[0]).toBeCloseTo(-220.22, 1);
    expect(last[1]).toBeCloseTo(hnd[1], 2);

    // Verify continuous progression across antimeridian without jumps
    for (let i = 1; i < arc.coordinates.length; i++) {
      const deltaLng = Math.abs(arc.coordinates[i][0] - arc.coordinates[i - 1][0]);
      expect(deltaLng).toBeLessThan(10);
    }
  });
});

describe('annotations/animation', () => {
  it('computes callout animation opacity during enter, hold, and exit', () => {
    const callout: CalloutItem = {
      kind: 'callout',
      id: 'callout-1',
      styleId: 'standard-card',
      styleVersion: 1,
      content: { title: 'Test Callout' },
      binding: { kind: 'geographic', lngLat: [10, 20], altitude: 0 },
      offset: [0, 0],
      anchor: 'bottom',
      startTime: 2,
      endTime: 6,
      transition: {
        enter: 'fade',
        exit: 'fade',
        enterDuration: 1,
        exitDuration: 1,
      },
      connector: {
        visible: false,
        style: 'solid',
        color: '#000',
        width: 1,
        endDot: false,
        endDotRadius: 2,
      },
      opacity: 1,
      scale: 1,
      settings: {},
      linkTitleToLocation: false,
    };

    // Before start
    expect(computeOpacity(callout, 1)).toBe(0);
    expect(computePhase(callout.startTime, callout.endTime, 1, 1, 1)).toBeNull();

    // Entering (midway enter at 2.5s)
    const enterState = computePhase(callout.startTime, callout.endTime, 1, 1, 2.5);
    expect(enterState).not.toBeNull();
    expect(enterState!.progress).toBeCloseTo(0.5, 1);
    expect(computeOpacity(callout, 2.5)).toBeCloseTo(0.5, 1);

    // Active / Hold (at 4s)
    const holdState = computePhase(callout.startTime, callout.endTime, 1, 1, 4);
    expect(holdState).not.toBeNull();
    expect(holdState!.phase).toBe('visible');
    expect(computeOpacity(callout, 4)).toBe(1);

    // Exiting (midway exit at 5.5s)
    const exitState = computePhase(callout.startTime, callout.endTime, 1, 1, 5.5);
    expect(exitState).not.toBeNull();
    expect(exitState!.progress).toBeCloseTo(0.5, 1);
    expect(computeOpacity(callout, 5.5)).toBeCloseTo(0.5, 1);

    // After end
    expect(computeOpacity(callout, 7)).toBe(0);
    expect(computePhase(callout.startTime, callout.endTime, 1, 1, 7)).toBeNull();
  });
});
