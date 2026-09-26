import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  importRouteFile,
  parseGPX,
  parseKML,
  parseGeoJSON,
  sanitizeFeatureCollection,
  isValidCoordinate,
  sanitizeLineCoordinates,
  sanitizeMultiLineCoordinates,
} from '@/services/fileImport';
import {
  parseProjectDocument,
  createProject,
  toProjectDocument,
  CAMERA_TRACK_ID,
  PROJECT_SCHEMA_VERSION,
} from '@/store/projectDocument';
import { useProjectStore } from '@/store/useProjectStore';
import { getRouteCoords } from '@/engine/cameraUtils';
import { validateStoreInvariants, type MinimalProjectState } from '../../e2e/fuzz/storeInvariants';
import type { RouteItem } from '@/store/types';

function createMockFile(content: string | Uint8Array, filename: string): File {
  const blob = typeof content === 'string'
    ? new Blob([content], { type: 'text/plain' })
    : new Blob([content], { type: 'application/octet-stream' });
  return new File([blob], filename);
}

function createMinimalRouteItem(name: string, geojson: GeoJSON.FeatureCollection): RouteItem {
  return {
    kind: 'route',
    id: `route-${Math.random().toString(36).slice(2, 9)}`,
    name,
    geojson,
    startTime: 0,
    endTime: 10,
    style: {
      color: '#22c55e',
      width: 4,
      glow: false,
      glowColor: '#22c55e',
      glowWidth: 12,
      trailFade: false,
      trailFadeLength: 0.3,
      dashPattern: null,
      animationType: 'draw',
    },
    easing: 'easeInOutCubic',
  };
}

describe('File Import Payload Fuzzing', () => {
  beforeEach(() => {
    useProjectStore.getState().loadFullProject(createProject());
  });

  // =========================================================================
  // Fuzz Category 1: Corrupted & Empty Files
  // =========================================================================
  describe('Fuzz Category 1: Corrupted & Empty Files', () => {
    it('rejects 0-byte empty files for all supported extensions (.gpx, .kml, .geojson, .json)', async () => {
      const extensions = ['gpx', 'kml', 'geojson', 'json'];

      for (const ext of extensions) {
        const file = createMockFile('', `empty-file.${ext}`);
        await expect(importRouteFile(file)).rejects.toThrow();
      }
    });

    it('rejects empty and whitespace-only text inputs across all standalone parsers', () => {
      const emptyInputs = ['', '   ', '\n\t  \r\n'];

      for (const input of emptyInputs) {
        expect(() => parseGPX(input)).toThrow();
        expect(() => parseKML(input)).toThrow();
        expect(() => parseGeoJSON(input)).toThrow();
      }
    });

    it('rejects pure binary garbage and random byte buffers without thread crashes', async () => {
      const binaryPayloads = [
        new Uint8Array([0x00, 0xff, 0xfe, 0x01, 0x02, 0x7f]),
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG header
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), // JPEG header
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // ZIP header
        new Uint8Array(Array.from({ length: 256 }, (_, i) => i)),
      ];

      for (const bytes of binaryPayloads) {
        for (const ext of ['gpx', 'kml', 'geojson', 'json', 'bin', 'dat']) {
          const file = createMockFile(bytes, `corrupt.${ext}`);
          await expect(importRouteFile(file)).rejects.toThrow();
        }
      }
    });

    it('fuzzes parsers with randomized pseudo-binary buffers via fast-check', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 512 }), async (bytes) => {
          const file = createMockFile(bytes, 'fuzzed-binary.gpx');
          let errorThrown = false;
          try {
            await importRouteFile(file);
          } catch (err) {
            errorThrown = true;
            expect(err).toBeInstanceOf(Error);
          }
          expect(errorThrown).toBe(true);
        }),
        { numRuns: 30 },
      );
    });

    it('rejects truncated XML and malformed JSON strings with friendly errors', async () => {
      const truncatedXmlList = [
        '<gpx version="1.1"><trk><name>Truncated track',
        '<gpx><trk><trkseg><trkpt lat="12.3"',
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString>',
        '<?xml version="1.0"?><gpx><trk>',
        '<gpx><trk></kml>', // Mismatched tags
      ];

      for (const xml of truncatedXmlList) {
        expect(() => parseGPX(xml)).toThrow();
        expect(() => parseKML(xml)).toThrow();

        const gpxFile = createMockFile(xml, 'truncated.gpx');
        await expect(importRouteFile(gpxFile)).rejects.toThrow();

        const kmlFile = createMockFile(xml, 'truncated.kml');
        await expect(importRouteFile(kmlFile)).rejects.toThrow();
      }

      const malformedJsonList = [
        '{"type": "FeatureCollection", "features": [',
        '{"type": "FeatureCollection", "features": [}',
        '{ "type": "FeatureCollection", ',
        '{"type": "Feature',
        'undefined',
        'NaN',
        '{"coordinates": [12.34, ]}',
      ];

      for (const json of malformedJsonList) {
        expect(() => parseGeoJSON(json)).toThrow();

        const jsonFile = createMockFile(json, 'malformed.geojson');
        await expect(importRouteFile(jsonFile)).rejects.toThrow();
      }
    });
  });

  // =========================================================================
  // Fuzz Category 2: Pathological GeoJSON
  // =========================================================================
  describe('Fuzz Category 2: Pathological GeoJSON', () => {
    it('safely handles FeatureCollection with empty features []', async () => {
      const emptyFC = JSON.stringify({ type: 'FeatureCollection', features: [] });
      const parsed = parseGeoJSON(emptyFC);

      expect(parsed.type).toBe('FeatureCollection');
      expect(parsed.features).toEqual([]);

      const file = createMockFile(emptyFC, 'empty-fc.geojson');
      const imported = await importRouteFile(file);
      expect(imported.name).toBe('empty-fc');
      expect(imported.geojson.features).toEqual([]);

      // Ensure downstream consumers do not crash on empty features
      const item = createMinimalRouteItem(imported.name, imported.geojson);
      useProjectStore.getState().addItem(item);
      expect(getRouteCoords(item.id)).toBeNull();
    });

    it('safely strips or sanitizes features with null geometry or missing coordinates', async () => {
      const pathologicalGeoJSON = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { name: 'Null Geom' }, geometry: null },
          { type: 'Feature', properties: { name: 'Missing Coords' }, geometry: { type: 'LineString' } },
          { type: 'Feature', properties: { name: 'Null Coords' }, geometry: { type: 'LineString', coordinates: null } },
          { type: 'Feature', properties: { name: 'Valid Feature' }, geometry: { type: 'LineString', coordinates: [[10, 20], [30, 40]] } },
        ],
      });

      const parsed = parseGeoJSON(pathologicalGeoJSON);
      expect(parsed.type).toBe('FeatureCollection');

      // Crucial invariant: NO feature in the result may have a null or missing geometry
      for (const f of parsed.features) {
        expect(f.geometry).not.toBeNull();
        expect(typeof f.geometry.type).toBe('string');
        if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
          expect(Array.isArray(f.geometry.coordinates)).toBe(true);
        }
      }

      // Downstream operations must not throw TypeError: Cannot read properties of null (reading 'type')
      const item = createMinimalRouteItem('Null-Geom-Test', parsed);
      expect(() => {
        const pointCount = item.geojson.features.reduce((sum, f) => {
          if (f.geometry.type === 'LineString') return sum + f.geometry.coordinates.length;
          return sum;
        }, 0);
        expect(pointCount).toBe(2);
      }).not.toThrow();

      useProjectStore.getState().addItem(item);
      const coords = getRouteCoords(item.id);
      expect(coords).toEqual([[10, 20], [30, 40]]);
    });

    it('sanitizes 1D coordinates, NaN/Infinity coordinates, and string coordinates', () => {
      const messyGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [10, 20], // Valid
                [123] as unknown as [number, number], // 1D coordinate
                [NaN, 45] as unknown as [number, number], // NaN
                [10, Infinity] as unknown as [number, number], // Infinity
                [-Infinity, -Infinity] as unknown as [number, number], // -Infinity
                ['12.34', '56.78'] as unknown as [number, number], // Strings
                [null, undefined] as unknown as [number, number], // Null/undefined
                [] as unknown as [number, number], // Empty
                [50, 60, 100], // Valid 3D with altitude
                [70, 80], // Valid 2D
              ] as unknown as number[][],
            },
          },
        ],
      };

      const sanitized = sanitizeFeatureCollection(messyGeoJSON);
      const lineFeature = sanitized.features[0];
      expect(lineFeature).toBeDefined();
      expect(lineFeature.geometry.type).toBe('LineString');

      const coords = (lineFeature.geometry as GeoJSON.LineString).coordinates;
      expect(coords).toEqual([
        [10, 20],
        [50, 60, 100],
        [70, 80],
      ]);

      // Assert NO NaN or non-finite values exist in any coordinate
      for (const coord of coords) {
        expect(Number.isFinite(coord[0])).toBe(true);
        expect(Number.isFinite(coord[1])).toBe(true);
        expect(Number.isNaN(coord[0])).toBe(false);
        expect(Number.isNaN(coord[1])).toBe(false);
      }
    });

    it('safely handles MultiLineString with 0 sub-lines or empty coordinate arrays', () => {
      const pathologicalMultiLines = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { test: 'empty sublines' },
            geometry: { type: 'MultiLineString', coordinates: [] },
          },
          {
            type: 'Feature',
            properties: { test: 'nested empty arrays' },
            geometry: { type: 'MultiLineString', coordinates: [[], [], []] },
          },
          {
            type: 'Feature',
            properties: { test: 'mixed corrupt sublines' },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [[NaN, NaN]],
                [[10, 20], [30, 40]],
                [],
              ],
            },
          },
        ],
      });

      const parsed = parseGeoJSON(pathologicalMultiLines);
      expect(parsed.type).toBe('FeatureCollection');

      for (const feature of parsed.features) {
        const geom = feature.geometry as GeoJSON.MultiLineString;
        expect(Array.isArray(geom.coordinates)).toBe(true);
        for (const line of geom.coordinates) {
          expect(Array.isArray(line)).toBe(true);
          for (const pt of line) {
            expect(Number.isFinite(pt[0])).toBe(true);
            expect(Number.isFinite(pt[1])).toBe(true);
          }
        }
      }

      // Point count reduce must execute cleanly without NaN or TypeError
      const pointCount = parsed.features.reduce((sum, f) => {
        if (f.geometry.type === 'MultiLineString') {
          return sum + (f.geometry as GeoJSON.MultiLineString).coordinates.reduce((count, line) => count + line.length, 0);
        }
        return sum;
      }, 0);
      expect(pointCount).toBe(2);
    });

    it('generative property fuzz: sanitizeFeatureCollection never returns NaNs or null geometries', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              type: fc.constant('Feature' as const),
              properties: fc.dictionary(fc.string(), fc.anything()),
              geometry: fc.oneof(
                fc.constant(null),
                fc.record({
                  type: fc.constant('LineString' as const),
                  coordinates: fc.array(
                    fc.oneof(
                      fc.tuple(fc.double(), fc.double()),
                      fc.tuple(fc.double(), fc.double(), fc.double()),
                      fc.tuple(fc.constant(NaN), fc.double()),
                      fc.tuple(fc.double(), fc.constant(Infinity)),
                      fc.constant([] as number[]),
                      fc.constant([123] as number[]),
                    ),
                  ),
                }),
                fc.record({
                  type: fc.constant('MultiLineString' as const),
                  coordinates: fc.array(fc.array(fc.array(fc.double()))),
                }),
              ),
            }),
          ),
          (rawFeatures) => {
            const rawFC = {
              type: 'FeatureCollection' as const,
              features: rawFeatures as unknown as GeoJSON.Feature[],
            };

            const sanitized = sanitizeFeatureCollection(rawFC);
            expect(sanitized.type).toBe('FeatureCollection');

            for (const f of sanitized.features) {
              expect(f.geometry).not.toBeNull();
              expect(typeof f.geometry.type).toBe('string');
              if (f.geometry.type === 'LineString') {
                for (const c of f.geometry.coordinates) {
                  expect(Array.isArray(c)).toBe(true);
                  expect(c.length).toBeGreaterThanOrEqual(2);
                  expect(Number.isFinite(c[0])).toBe(true);
                  expect(Number.isFinite(c[1])).toBe(true);
                  expect(Number.isNaN(c[0])).toBe(false);
                  expect(Number.isNaN(c[1])).toBe(false);
                }
              }
            }
          },
        ),
        { numRuns: 40 },
      );
    });
  });

  // =========================================================================
  // Fuzz Category 3: Pathological GPX & KML
  // =========================================================================
  describe('Fuzz Category 3: Pathological GPX & KML', () => {
    it('safely parses GPX with <trk> but no <trkseg> or <trkpt>', async () => {
      const gpxSamples = [
        '<gpx version="1.1"><trk><name>Empty Track</name></trk></gpx>',
        '<gpx version="1.1"><trk><name>Empty Seg</name><trkseg></trkseg></trk></gpx>',
        '<gpx version="1.1"><trk><name>Whitespace Seg</name><trkseg>   </trkseg></trk></gpx>',
      ];

      for (const xml of gpxSamples) {
        const parsed = parseGPX(xml);
        expect(parsed.type).toBe('FeatureCollection');
        expect(Array.isArray(parsed.features)).toBe(true);

        const file = createMockFile(xml, 'empty-trk.gpx');
        const imported = await importRouteFile(file);
        expect(imported.geojson.type).toBe('FeatureCollection');
        expect(imported.geojson.features).toBeDefined();

        const item = createMinimalRouteItem(imported.name, imported.geojson);
        useProjectStore.getState().addItem(item);
        expect(getRouteCoords(item.id)).toBeNull();
      }
    });

    it('safely parses GPX with <trkpt> missing lat or lon attributes', async () => {
      const gpxSamples = [
        '<gpx version="1.1"><trk><trkseg><trkpt><ele>10</ele></trkpt></trkseg></trk></gpx>',
        '<gpx version="1.1"><trk><trkseg><trkpt lat="10"></trkpt></trkseg></trk></gpx>',
        '<gpx version="1.1"><trk><trkseg><trkpt lon="20"></trkpt></trkseg></trk></gpx>',
        '<gpx version="1.1"><trk><trkseg><trkpt lat="invalid" lon="invalid"></trkpt></trkseg></trk></gpx>',
        '<gpx version="1.1"><trk><trkseg><trkpt lat="NaN" lon="NaN"></trkpt></trkseg></trk></gpx>',
      ];

      for (const xml of gpxSamples) {
        const parsed = parseGPX(xml);
        expect(parsed.type).toBe('FeatureCollection');

        for (const f of parsed.features) {
          expect(f.geometry).not.toBeNull();
          if (f.geometry.type === 'LineString') {
            for (const coord of f.geometry.coordinates) {
              expect(Number.isFinite(coord[0])).toBe(true);
              expect(Number.isFinite(coord[1])).toBe(true);
            }
          }
        }
      }
    });

    it('safely handles KML with <LineString> but empty or whitespace <coordinates>', async () => {
      const kmlSamples = [
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates></coordinates></LineString></Placemark></Document></kml>',
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>   \n\t  </coordinates></LineString></Placemark></Document></kml>',
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>No Coords</name><LineString/></Placemark></Document></kml>',
      ];

      for (const xml of kmlSamples) {
        const parsed = parseKML(xml);
        expect(parsed.type).toBe('FeatureCollection');

        // Crucial: toGeoJSON generates a feature with geometry: null for empty KML coordinates.
        // Our parser must sanitize this so NO feature with null geometry is returned.
        for (const f of parsed.features) {
          expect(f.geometry).not.toBeNull();
          expect(typeof f.geometry.type).toBe('string');
        }

        const file = createMockFile(xml, 'empty-coords.kml');
        const imported = await importRouteFile(file);
        expect(imported.geojson.features.length).toBe(0);

        // Downstream calculation does not throw
        const item = createMinimalRouteItem(imported.name, imported.geojson);
        expect(() => {
          item.geojson.features.forEach((f) => {
            const _t = f.geometry.type;
          });
        }).not.toThrow();
      }
    });

    it('safely handles KML with invalid non-numeric coordinates', async () => {
      const kmlSamples = [
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>foo,bar,baz</coordinates></LineString></Placemark></Document></kml>',
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>NaN,NaN,NaN</coordinates></LineString></Placemark></Document></kml>',
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>Infinity,Infinity</coordinates></LineString></Placemark></Document></kml>',
      ];

      for (const xml of kmlSamples) {
        const parsed = parseKML(xml);
        expect(parsed.type).toBe('FeatureCollection');

        for (const f of parsed.features) {
          expect(f.geometry).not.toBeNull();
          if (f.geometry.type === 'LineString') {
            for (const coord of f.geometry.coordinates) {
              expect(Number.isFinite(coord[0])).toBe(true);
              expect(Number.isFinite(coord[1])).toBe(true);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // Fuzz Category 4: Pathological Project Documents
  // =========================================================================
  describe('Fuzz Category 4: Pathological Project Documents', () => {
    it('rejects unsupported schema versions and non-integer/negative versions', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      // Newer schema version
      expect(() => parseProjectDocument({ ...validDoc, schemaVersion: 999 })).toThrow(/newer than supported version/);
      expect(() => parseProjectDocument({ ...validDoc, schemaVersion: 3 })).toThrow(/newer than supported version/);

      // Negative schema version
      expect(() => parseProjectDocument({ ...validDoc, schemaVersion: -1 })).toThrow();

      // Non-integer schema version
      expect(() => parseProjectDocument({ ...validDoc, schemaVersion: 1.5 })).toThrow();

      // String schema version
      expect(() => parseProjectDocument({ ...validDoc, schemaVersion: '1' })).toThrow();

      // NaN schema version
      expect(() => parseProjectDocument({ ...validDoc, schemaVersion: NaN })).toThrow();
    });

    it('rejects negative duration, duration: 0, and non-finite duration', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      expect(() => parseProjectDocument({ ...validDoc, duration: -10 })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, duration: 0 })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, duration: NaN })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, duration: Infinity })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, duration: -Infinity })).toThrow();
    });

    it('rejects invalid fps values (fps: 0, negative fps, arbitrary fps)', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      expect(() => parseProjectDocument({ ...validDoc, fps: 0 })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, fps: -30 })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, fps: 24 })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, fps: 45 })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, fps: NaN })).toThrow();
    });

    it('rejects missing or non-record items', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      const { items: _, ...docWithoutItems } = validDoc;
      expect(() => parseProjectDocument(docWithoutItems)).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, items: null })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, items: [] })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, items: 'not-items' })).toThrow();
    });

    it('safely heals missing itemOrder by populating itemOrder with all item IDs', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      const { itemOrder: _, ...docWithoutOrder } = validDoc;
      const parsed = parseProjectDocument(docWithoutOrder);

      expect(parsed.itemOrder).toBeDefined();
      expect(Array.isArray(parsed.itemOrder)).toBe(true);
      expect(parsed.itemOrder).toContain(CAMERA_TRACK_ID);
    });

    it('rejects invalid non-array itemOrder types', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      expect(() => parseProjectDocument({ ...validDoc, itemOrder: null })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, itemOrder: 'bad-order' })).toThrow();
      expect(() => parseProjectDocument({ ...validDoc, itemOrder: 123 })).toThrow();
    });

    it('rejects project documents missing the camera track', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      // Items empty (no camera track)
      const docWithoutCamera = {
        ...validDoc,
        items: {},
        itemOrder: [],
      };
      expect(() => parseProjectDocument(docWithoutCamera)).toThrow(/camera track/i);

      // Camera track replaced with a non-camera item
      const docWithCorruptedCamera = {
        ...validDoc,
        items: {
          [CAMERA_TRACK_ID]: {
            kind: 'route',
            id: CAMERA_TRACK_ID,
            name: 'Fake Camera',
            geojson: { type: 'FeatureCollection', features: [] },
            startTime: 0,
            endTime: 5,
            style: {
              color: '#fff',
              width: 2,
              glow: false,
              glowColor: '#fff',
              glowWidth: 4,
              trailFade: false,
              trailFadeLength: 0.1,
              dashPattern: null,
            },
            easing: 'linear',
          },
        },
      };
      expect(() => parseProjectDocument(docWithCorruptedCamera)).toThrow(/camera track/i);
    });

    it('sanitizes route GeoJSON within project documents, preventing corrupted states with NaN', () => {
      const baseProject = createProject();
      const validDoc = toProjectDocument(baseProject);

      const dirtyRoute = {
        kind: 'route' as const,
        id: 'route-fuzz-1',
        name: 'Dirty Route',
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: null, // Null geometry!
            },
            {
              type: 'Feature' as const,
              properties: {},
              geometry: {
                type: 'LineString' as const,
                coordinates: [
                  [NaN, 10] as unknown as [number, number],
                  [10, 20],
                  [30, 40],
                ],
              },
            },
          ],
        },
        startTime: 0,
        endTime: 5,
        style: {
          color: '#22c55e',
          width: 4,
          glow: false,
          glowColor: '#22c55e',
          glowWidth: 12,
          trailFade: false,
          trailFadeLength: 0.3,
          dashPattern: null,
        },
        easing: 'linear' as const,
      };

      const docWithDirtyRoute = {
        ...validDoc,
        items: {
          ...validDoc.items,
          [dirtyRoute.id]: dirtyRoute,
        },
        itemOrder: [...validDoc.itemOrder, dirtyRoute.id],
      };

      const parsed = parseProjectDocument(docWithDirtyRoute);
      const parsedRoute = parsed.items[dirtyRoute.id];
      expect(parsedRoute.kind).toBe('route');

      if (parsedRoute.kind === 'route') {
        // Null geometry must be stripped
        expect(parsedRoute.geojson.features.length).toBe(1);
        const coords = (parsedRoute.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
        expect(coords).toEqual([[10, 20], [30, 40]]);
        // Must contain NO NaNs
        expect(Number.isNaN(coords[0][0])).toBe(false);
      }
    });

    it('asserts core invariant: hydrated Zustand store obeys all store invariants with 0 violations', () => {
      const project = createProject();
      useProjectStore.getState().loadFullProject(project);

      const state = useProjectStore.getState();
      const minimalState: MinimalProjectState = {
        items: state.items as unknown as MinimalProjectState['items'],
        itemOrder: state.itemOrder,
        duration: state.duration,
        fps: state.fps,
        playheadTime: state.playheadTime,
        selectedItemId: state.selectedItemId,
        selectedKeyframeId: state.selectedKeyframeId,
      };

      const violations = validateStoreInvariants(minimalState);
      expect(violations).toHaveLength(0);
    });
  });

  // =========================================================================
  // Core Invariant Verification
  // =========================================================================
  describe('Core Invariant Verification', () => {
    it('never throws unhandled exceptions outside friendly Error/reject for arbitrary inputs', async () => {
      const adversarialInputs = [
        null,
        undefined,
        12345,
        {},
        [],
        true,
        '<<<>>>',
        '{"invalid": json}',
      ];

      for (const input of adversarialInputs) {
        expect(() => {
          try {
            parseProjectDocument(input);
          } catch (err) {
            expect(err).toBeInstanceOf(Error);
          }
        }).not.toThrow();

        if (typeof input === 'string') {
          expect(() => {
            try {
              parseGPX(input);
            } catch (err) {
              expect(err).toBeInstanceOf(Error);
            }
          }).not.toThrow();

          expect(() => {
            try {
              parseKML(input);
            } catch (err) {
              expect(err).toBeInstanceOf(Error);
            }
          }).not.toThrow();

          expect(() => {
            try {
              parseGeoJSON(input);
            } catch (err) {
              expect(err).toBeInstanceOf(Error);
            }
          }).not.toThrow();
        }
      }
    });
  });
});
