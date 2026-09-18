import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import {
  calculateBearing,
  calculatePitch,
  truncateCoordinate,
  truncateCoordinates,
  extractLineStringsFromGeometry,
} from '@/engine/geoUtils';
import { interpolateCamera, getCameraAtTimeFromKeyframes } from '@/engine/cameraInterpolation';
import { applyEasing } from '@/engine/easings';
import { getLineSegment, getAnimatedLine } from '@/engine/lineAnimation';
import {
  parseProjectDocument,
  toProjectDocument,
  createProject,
  PROJECT_SCHEMA_VERSION,
  CAMERA_TRACK_ID,
} from '@/store/projectDocument';
import type { CameraKeyframe, EasingName, Project } from '@/store/types';

describe('Property-Based Math & Engine Fuzzing', () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Arbitraries
  // ─────────────────────────────────────────────────────────────────────────────

  const lngArbitrary = fc.double({ min: -180, max: 180, noNaN: true });
  const latArbitrary = fc.double({ min: -90, max: 90, noNaN: true });
  const altArbitrary = fc.double({ min: -10000, max: 100000, noNaN: true });
  const coord2DArbitrary = fc.tuple(lngArbitrary, latArbitrary);
  const coord3DArbitrary = fc.tuple(lngArbitrary, latArbitrary, altArbitrary);
  const coordArbitrary = fc.oneof(coord2DArbitrary, coord3DArbitrary);

  const precisionArbitrary = fc.integer({ min: 0, max: 8 });

  const easingArbitrary = fc.constantFrom<EasingName>(
    'linear',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
    'easeInCubic',
    'easeOutCubic',
    'easeInOutCubic',
    'easeInOutSine',
    'bounce',
  );

  const validKeyframeArbitrary = (timeMin = 0, timeMax = 100): fc.Arbitrary<CameraKeyframe> =>
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      time: fc.double({ min: timeMin, max: timeMax, noNaN: true }),
      camera: fc.record({
        center: coord2DArbitrary,
        zoom: fc.double({ min: 0, max: 26, noNaN: true }),
        pitch: fc.double({ min: 0, max: 90, noNaN: true }),
        bearing: fc.double({ min: -3600, max: 3600, noNaN: true }),
        altitude: fc.option(altArbitrary, { nil: null }),
      }),
      easing: easingArbitrary,
      followRoute: fc.constant(null),
    });

  // GeoJSON Geometry Arbitraries
  const pointGeomArbitrary: fc.Arbitrary<GeoJSON.Point> = coordArbitrary.map((coord) => ({
    type: 'Point',
    coordinates: coord,
  }));

  const multiPointGeomArbitrary: fc.Arbitrary<GeoJSON.MultiPoint> = fc
    .array(coordArbitrary, { minLength: 1, maxLength: 8 })
    .map((coordinates) => ({
      type: 'MultiPoint',
      coordinates,
    }));

  const lineStringGeomArbitrary: fc.Arbitrary<GeoJSON.LineString> = fc
    .array(coordArbitrary, { minLength: 2, maxLength: 10 })
    .map((coordinates) => ({
      type: 'LineString',
      coordinates,
    }));

  const multiLineStringGeomArbitrary: fc.Arbitrary<GeoJSON.MultiLineString> = fc
    .array(fc.array(coordArbitrary, { minLength: 2, maxLength: 6 }), { minLength: 1, maxLength: 4 })
    .map((coordinates) => ({
      type: 'MultiLineString',
      coordinates,
    }));

  // Closed linear ring with at least 4 coordinates
  const linearRingArbitrary: fc.Arbitrary<number[][]> = fc
    .tuple(coordArbitrary, coordArbitrary, coordArbitrary)
    .map(([c1, c2, c3]) => [c1, c2, c3, c1]);

  const polygonGeomArbitrary: fc.Arbitrary<GeoJSON.Polygon> = fc
    .array(linearRingArbitrary, { minLength: 1, maxLength: 3 })
    .map((coordinates) => ({
      type: 'Polygon',
      coordinates,
    }));

  const multiPolygonGeomArbitrary: fc.Arbitrary<GeoJSON.MultiPolygon> = fc
    .array(fc.array(linearRingArbitrary, { minLength: 1, maxLength: 2 }), { minLength: 1, maxLength: 3 })
    .map((coordinates) => ({
      type: 'MultiPolygon',
      coordinates,
    }));

  const anySimpleGeometryArbitrary: fc.Arbitrary<GeoJSON.Geometry> = fc.oneof(
    pointGeomArbitrary,
    multiPointGeomArbitrary,
    lineStringGeomArbitrary,
    multiLineStringGeomArbitrary,
    polygonGeomArbitrary,
    multiPolygonGeomArbitrary,
  );

  const geometryCollectionArbitrary: fc.Arbitrary<GeoJSON.GeometryCollection> = fc
    .array(anySimpleGeometryArbitrary, { minLength: 1, maxLength: 4 })
    .map((geometries) => ({
      type: 'GeometryCollection',
      geometries,
    }));

  const geoJsonGeometryArbitrary: fc.Arbitrary<GeoJSON.Geometry> = fc.oneof(
    anySimpleGeometryArbitrary,
    geometryCollectionArbitrary,
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Property 1: Bearing and Pitch Mathematical Invariants
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Property 1: Bearing and Pitch Mathematical Invariants', () => {
    it('calculateBearing always returns a finite number in [0, 360) for any coordinates in [-180, 180] x [-90, 90]', () => {
      fc.assert(
        fc.property(coord2DArbitrary, coord2DArbitrary, (start, end) => {
          const bearing = calculateBearing(start, end);

          expect(Number.isFinite(bearing)).toBe(true);
          expect(Number.isNaN(bearing)).toBe(false);
          expect(bearing).toBeGreaterThanOrEqual(0);
          expect(bearing).toBeLessThan(360);
          expect(Object.is(bearing, -0)).toBe(false);
        }),
        { numRuns: 500 },
      );
    });

    it('calculatePitch always returns a finite number in [-90, 90] for any coordinates and altitudes', () => {
      fc.assert(
        fc.property(coordArbitrary, coordArbitrary, (start, end) => {
          const pitch = calculatePitch(start, end);

          expect(Number.isFinite(pitch)).toBe(true);
          expect(Number.isNaN(pitch)).toBe(false);
          expect(pitch).toBeGreaterThanOrEqual(-90);
          expect(pitch).toBeLessThanOrEqual(90);
        }),
        { numRuns: 500 },
      );
    });

    it('handles specific edge cases without returning NaN or out-of-range values', () => {
      const edgeCases: Array<{ name: string; start: number[]; end: number[] }> = [
        { name: 'identical origin', start: [0, 0], end: [0, 0] },
        { name: 'identical negative zero', start: [-0, -0], end: [-0, -0] },
        { name: 'identical north pole', start: [0, 90], end: [0, 90] },
        { name: 'identical south pole', start: [0, -90], end: [0, -90] },
        { name: 'north pole different lng', start: [10, 90], end: [120, 90] },
        { name: 'south pole different lng', start: [-30, -90], end: [80, -90] },
        { name: 'pole to pole N -> S', start: [0, 90], end: [0, -90] },
        { name: 'pole to pole S -> N', start: [0, -90], end: [0, 90] },
        { name: 'antimeridian crossing east to west', start: [179.9, 10], end: [-179.9, 10] },
        { name: 'antimeridian crossing west to east', start: [-179.9, -15], end: [179.9, -15] },
        { name: 'exact antimeridian boundary', start: [180, 0], end: [-180, 0] },
        { name: 'exact antimeridian reversed', start: [-180, 0], end: [180, 0] },
        { name: 'antipodal points on equator', start: [0, 0], end: [180, 0] },
        { name: 'antipodal points arbitrary', start: [45, 45], end: [-135, -45] },
        { name: 'identical 3D points', start: [10, 20, 500], end: [10, 20, 500] },
        { name: 'vertical ascent at same point', start: [10, 20, 0], end: [10, 20, 1000] },
        { name: 'vertical descent at same point', start: [10, 20, 1000], end: [10, 20, 0] },
        { name: 'ascent at north pole', start: [0, 90, 100], end: [0, 90, 500] },
        { name: 'descent at south pole', start: [0, -90, 500], end: [0, -90, 100] },
      ];

      for (const { name, start, end } of edgeCases) {
        const bearing = calculateBearing(start, end);
        expect(Number.isFinite(bearing), `${name} bearing finite`).toBe(true);
        expect(Number.isNaN(bearing), `${name} bearing not NaN`).toBe(false);
        expect(bearing, `${name} bearing >= 0`).toBeGreaterThanOrEqual(0);
        expect(bearing, `${name} bearing < 360`).toBeLessThan(360);

        const pitch = calculatePitch(start, end);
        expect(Number.isFinite(pitch), `${name} pitch finite`).toBe(true);
        expect(Number.isNaN(pitch), `${name} pitch not NaN`).toBe(false);
        expect(pitch, `${name} pitch >= -90`).toBeGreaterThanOrEqual(-90);
        expect(pitch, `${name} pitch <= 90`).toBeLessThanOrEqual(90);
      }
    });

    it('gracefully handles malformed or empty inputs without throwing or returning NaN', () => {
      expect(calculateBearing([], [])).toBe(0);
      expect(calculateBearing([0], [0])).toBe(0);
      expect(calculateBearing([NaN, 0], [10, 20])).toBe(0);
      expect(calculateBearing([0, Infinity], [10, 20])).toBe(0);

      expect(calculatePitch([], [])).toBe(0);
      expect(calculatePitch([0, 0], [10, 10])).toBe(0);
      expect(calculatePitch([0, 0, NaN], [10, 10, 20])).toBe(0);
      expect(calculatePitch([0, 0, 10], [10, 10, Infinity])).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property 2: Coordinate Truncation Invariants
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Property 2: Coordinate Truncation Invariants', () => {
    it('truncateCoordinate rounds lng and lat to precision p, alt to 1 decimal, never produces NaN', () => {
      fc.assert(
        fc.property(coordArbitrary, precisionArbitrary, (coord, precision) => {
          const truncated = truncateCoordinate(coord, precision);

          expect(truncated.length).toBe(coord.length);
          for (let i = 0; i < truncated.length; i++) {
            expect(Number.isFinite(truncated[i])).toBe(true);
            expect(Number.isNaN(truncated[i])).toBe(false);
            expect(Object.is(truncated[i], -0)).toBe(false);
          }

          // Check rounding precision factor
          const factor = Math.pow(10, precision);
          expect(truncated[0]).toBeCloseTo(Math.round(coord[0] * factor) / factor, 10);
          expect(truncated[1]).toBeCloseTo(Math.round(coord[1] * factor) / factor, 10);
          if (coord.length > 2 && coord[2] !== undefined) {
            expect(truncated[2]).toBeCloseTo(Math.round(coord[2] * 10) / 10, 10);
          }
        }),
        { numRuns: 300 },
      );
    });

    it('truncateCoordinates preserves geometry structure, valid coordinates, and never introduces NaN', () => {
      const verifyNoNaNAndValidStructure = (
        original: GeoJSON.Geometry,
        truncated: GeoJSON.Geometry,
        precision: number,
      ) => {
        expect(truncated.type).toBe(original.type);

        if (truncated.type === 'GeometryCollection') {
          const origGC = original as GeoJSON.GeometryCollection;
          expect(truncated.geometries.length).toBe(origGC.geometries.length);
          for (let i = 0; i < truncated.geometries.length; i++) {
            verifyNoNaNAndValidStructure(origGC.geometries[i], truncated.geometries[i], precision);
          }
          return;
        }

        const checkNested = (origArr: unknown, truncArr: unknown) => {
          expect(Array.isArray(truncArr)).toBe(true);
          const tArr = truncArr as unknown[];
          const oArr = origArr as unknown[];
          expect(tArr.length).toBe(oArr.length);

          if (typeof tArr[0] === 'number') {
            for (let i = 0; i < tArr.length; i++) {
              const val = tArr[i] as number;
              expect(Number.isFinite(val)).toBe(true);
              expect(Number.isNaN(val)).toBe(false);
              expect(Object.is(val, -0)).toBe(false);
            }
          } else {
            for (let i = 0; i < tArr.length; i++) {
              checkNested(oArr[i], tArr[i]);
            }
          }
        };

        const origCoords = (original as { coordinates: unknown }).coordinates;
        const truncCoords = (truncated as { coordinates: unknown }).coordinates;
        checkNested(origCoords, truncCoords);
      };

      fc.assert(
        fc.property(geoJsonGeometryArbitrary, precisionArbitrary, (geometry, precision) => {
          const result = truncateCoordinates(geometry, precision);
          verifyNoNaNAndValidStructure(geometry, result, precision);
        }),
        { numRuns: 200 },
      );
    });

    it('extractLineStringsFromGeometry extracts valid line arrays without NaN from any geometry', () => {
      fc.assert(
        fc.property(geoJsonGeometryArbitrary, (geometry) => {
          const lines = extractLineStringsFromGeometry(geometry);
          expect(Array.isArray(lines)).toBe(true);
          for (const ring of lines) {
            expect(Array.isArray(ring)).toBe(true);
            for (const pt of ring) {
              expect(Array.isArray(pt)).toBe(true);
              expect(pt.length).toBeGreaterThanOrEqual(2);
              for (const c of pt) {
                expect(Number.isFinite(c)).toBe(true);
                expect(Number.isNaN(c)).toBe(false);
              }
            }
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property 3: Camera Interpolation Invariants
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Property 3: Camera Interpolation Invariants', () => {
    it('interpolateCamera outputs strictly finite zoom [0, 26], pitch [0, 90], finite bearing, and valid coordinates in [-180, 180] x [-90, 90]', () => {
      const keyframesArrayArbitrary = fc.array(validKeyframeArbitrary(0, 100), {
        minLength: 1,
        maxLength: 15,
      });
      const timeArbitrary = fc.double({ min: 0, max: 100, noNaN: true });

      fc.assert(
        fc.property(keyframesArrayArbitrary, timeArbitrary, (keyframes, t) => {
          const state = interpolateCamera(keyframes, t);

          expect(state).toBeDefined();
          expect(Number.isFinite(state.zoom)).toBe(true);
          expect(Number.isNaN(state.zoom)).toBe(false);
          expect(state.zoom).toBeGreaterThanOrEqual(0);
          expect(state.zoom).toBeLessThanOrEqual(26);

          expect(Number.isFinite(state.pitch)).toBe(true);
          expect(Number.isNaN(state.pitch)).toBe(false);
          expect(state.pitch).toBeGreaterThanOrEqual(0);
          expect(state.pitch).toBeLessThanOrEqual(90);

          expect(Number.isFinite(state.bearing)).toBe(true);
          expect(Number.isNaN(state.bearing)).toBe(false);
          expect(state.bearing).toBeGreaterThanOrEqual(0);
          expect(state.bearing).toBeLessThan(360);

          expect(Array.isArray(state.center)).toBe(true);
          expect(state.center.length).toBe(2);
          const [lng, lat] = state.center;
          expect(Number.isFinite(lng)).toBe(true);
          expect(Number.isNaN(lng)).toBe(false);
          expect(lng).toBeGreaterThanOrEqual(-180);
          expect(lng).toBeLessThanOrEqual(180);

          expect(Number.isFinite(lat)).toBe(true);
          expect(Number.isNaN(lat)).toBe(false);
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
        }),
        { numRuns: 400 },
      );
    });

    it('supports two-keyframe direct interpolation with normalized t in [0, 1]', () => {
      const kfArbitrary = validKeyframeArbitrary(0, 10);
      const normalizedTArbitrary = fc.double({ min: -0.5, max: 1.5, noNaN: true });

      fc.assert(
        fc.property(kfArbitrary, kfArbitrary, normalizedTArbitrary, (kfA, kfB, t) => {
          const state = interpolateCamera(kfA, kfB, t);

          expect(Number.isFinite(state.zoom)).toBe(true);
          expect(state.zoom).toBeGreaterThanOrEqual(0);
          expect(state.zoom).toBeLessThanOrEqual(26);

          expect(Number.isFinite(state.pitch)).toBe(true);
          expect(state.pitch).toBeGreaterThanOrEqual(0);
          expect(state.pitch).toBeLessThanOrEqual(90);

          expect(Number.isFinite(state.bearing)).toBe(true);
          expect(state.bearing).toBeGreaterThanOrEqual(0);
          expect(state.bearing).toBeLessThan(360);

          expect(state.center[0]).toBeGreaterThanOrEqual(-180);
          expect(state.center[0]).toBeLessThanOrEqual(180);
          expect(state.center[1]).toBeGreaterThanOrEqual(-90);
          expect(state.center[1]).toBeLessThanOrEqual(90);
        }),
        { numRuns: 300 },
      );
    });

    it('handles keyframe boundary conditions and edge cases safely', () => {
      const singleKf: CameraKeyframe = {
        id: 'kf-single',
        time: 5,
        camera: { center: [10, 20], zoom: 5, pitch: 30, bearing: 45, altitude: null },
        easing: 'linear',
        followRoute: null,
      };

      // Querying before, at, and after single keyframe
      expect(interpolateCamera([singleKf], 0).zoom).toBe(5);
      expect(interpolateCamera([singleKf], 5).zoom).toBe(5);
      expect(interpolateCamera([singleKf], 10).zoom).toBe(5);

      // Empty array fallback
      const emptyResult = interpolateCamera([], 5);
      expect(emptyResult.zoom).toBeGreaterThanOrEqual(0);
      expect(emptyResult.pitch).toBeGreaterThanOrEqual(0);

      // Co-located timestamps (division by zero protection)
      const kfSameTime1: CameraKeyframe = {
        ...singleKf,
        id: 'kf-1',
        time: 5,
        camera: { center: [0, 0], zoom: 2, pitch: 0, bearing: 0, altitude: null },
      };
      const kfSameTime2: CameraKeyframe = {
        ...singleKf,
        id: 'kf-2',
        time: 5,
        camera: { center: [50, 50], zoom: 10, pitch: 45, bearing: 180, altitude: null },
      };
      const coLocatedResult = interpolateCamera([kfSameTime1, kfSameTime2], 5);
      expect(Number.isFinite(coLocatedResult.zoom)).toBe(true);
      expect(Number.isNaN(coLocatedResult.zoom)).toBe(false);
    });

    it('applies all easing curves without ever leaving the [0, 1] range or returning NaN', () => {
      const easingNames: EasingName[] = [
        'linear',
        'easeInQuad',
        'easeOutQuad',
        'easeInOutQuad',
        'easeInCubic',
        'easeOutCubic',
        'easeInOutCubic',
        'easeInOutSine',
        'bounce',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...easingNames),
          fc.double({ min: -100, max: 100, noNaN: true }),
          (easing, t) => {
            const eased = applyEasing(easing, t);
            expect(Number.isFinite(eased)).toBe(true);
            expect(Number.isNaN(eased)).toBe(false);
            expect(eased).toBeGreaterThanOrEqual(0);
            expect(eased).toBeLessThanOrEqual(1);
          },
        ),
        { numRuns: 400 },
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property 4: Project Document Serialization Invariants
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Property 4: Project Document Serialization Invariants', () => {
    const projectOverridesArbitrary: fc.Arbitrary<Partial<Project>> = fc.record({
      duration: fc.double({ min: 1, max: 600, noNaN: true }),
      fps: fc.constantFrom<30 | 60>(30, 60),
      aspectRatio: fc.constantFrom<'16:9' | '21:9' | '4:3' | '1:1'>('16:9', '21:9', '4:3', '1:1'),
      exportResolution: fc.constantFrom<'480p' | '720p' | '1080p' | '1440p' | '2160p'>(
        '480p',
        '720p',
        '1080p',
        '1440p',
        '2160p',
      ),
      isVertical: fc.boolean(),
      projection: fc.constantFrom<'globe' | 'mercator'>('globe', 'mercator'),
      lightPreset: fc.constantFrom<'day' | 'night' | 'dusk' | 'dawn'>('day', 'night', 'dusk', 'dawn'),
      starIntensity: fc.double({ min: 0, max: 1, noNaN: true }),
      fogColor: fc.option(fc.constantFrom('#000000', '#ffffff', '#123456'), { nil: null }),
      terrainExaggeration: fc.double({ min: 0, max: 3, noNaN: true }),
      mapCenter: coord2DArbitrary,
    });

    it('for generated project documents, parseProjectDocument(toProjectDocument(project)) round-trips successfully', () => {
      fc.assert(
        fc.property(projectOverridesArbitrary, (overrides) => {
          const initialProject = createProject(overrides);
          const doc = toProjectDocument(initialProject);

          expect(doc.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);

          const roundTripped = parseProjectDocument(doc);

          expect(roundTripped.id).toBe(initialProject.id);
          expect(roundTripped.duration).toBeCloseTo(initialProject.duration, 8);
          expect(roundTripped.fps).toBe(initialProject.fps);
          expect(roundTripped.aspectRatio).toBe(initialProject.aspectRatio);
          expect(roundTripped.exportResolution).toBe(initialProject.exportResolution);
          expect(roundTripped.isVertical).toBe(initialProject.isVertical);
          expect(roundTripped.projection).toBe(initialProject.projection);
          expect(roundTripped.lightPreset).toBe(initialProject.lightPreset);
          expect(roundTripped.starIntensity).toBeCloseTo(initialProject.starIntensity, 8);
          expect(roundTripped.fogColor).toBe(initialProject.fogColor);
          expect(roundTripped.terrainExaggeration).toBeCloseTo(initialProject.terrainExaggeration, 8);
          expect(roundTripped.mapCenter[0]).toBeCloseTo(initialProject.mapCenter[0], 8);
          expect(roundTripped.mapCenter[1]).toBeCloseTo(initialProject.mapCenter[1], 8);

          // Camera track integrity
          expect(roundTripped.items[CAMERA_TRACK_ID]).toBeDefined();
          expect(roundTripped.itemOrder).toContain(CAMERA_TRACK_ID);
        }),
        { numRuns: 100 },
      );
    });

    it('for arbitrary JSON objects, parseProjectDocument either parses or fails with a known validation schema error, never throwing unhandled exceptions', () => {
      // Generate completely chaotic inputs
      const chaoticValueArbitrary = fc.anything({ maxDepth: 4 });

      fc.assert(
        fc.property(chaoticValueArbitrary, (chaoticInput) => {
          try {
            const parsed = parseProjectDocument(chaoticInput);
            expect(parsed).toBeDefined();
            expect(typeof parsed.id).toBe('string');
            expect(typeof parsed.duration).toBe('number');
          } catch (err: unknown) {
            // Must be a known Zod validation error or a schema version Error
            const isZod = err instanceof z.ZodError;
            const isSchemaVersionError =
              err instanceof Error &&
              (err.message.includes('schema version') || err.message.includes('Expected a GeoJSON'));
            expect(isZod || isSchemaVersionError).toBe(true);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Additional Engine Fuzzing: Line Animation Invariants
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Additional Engine Fuzzing: Line Animation Invariants', () => {
    it('getLineSegment and getAnimatedLine never return NaN coordinates and preserve valid line segments', () => {
      const lineCoordsArbitrary = fc.array(coord2DArbitrary, { minLength: 2, maxLength: 20 });
      const tArbitrary = fc.double({ min: -0.5, max: 1.5, noNaN: true });

      fc.assert(
        fc.property(lineCoordsArbitrary, tArbitrary, tArbitrary, (coords, t1, t2) => {
          const seg = getLineSegment(coords, t1, t2);
          expect(Array.isArray(seg)).toBe(true);

          const clampedT1 = Math.max(0, Math.min(1, t1));
          const clampedT2 = Math.max(0, Math.min(1, t2));

          if (clampedT1 > clampedT2) {
            expect(seg.length).toBe(0);
          } else {
            expect(seg.length).toBeGreaterThanOrEqual(2);
            for (const pt of seg) {
              expect(Number.isFinite(pt[0])).toBe(true);
              expect(Number.isNaN(pt[0])).toBe(false);
              expect(Number.isFinite(pt[1])).toBe(true);
              expect(Number.isNaN(pt[1])).toBe(false);
            }
          }

          const animated = getAnimatedLine(coords, t1);
          expect(Array.isArray(animated)).toBe(true);
          expect(animated.length).toBeGreaterThanOrEqual(2);
          for (const pt of animated) {
            expect(Number.isFinite(pt[0])).toBe(true);
            expect(Number.isNaN(pt[0])).toBe(false);
            expect(Number.isFinite(pt[1])).toBe(true);
            expect(Number.isNaN(pt[1])).toBe(false);
          }
        }),
        { numRuns: 200 },
      );
    });
  });
});
