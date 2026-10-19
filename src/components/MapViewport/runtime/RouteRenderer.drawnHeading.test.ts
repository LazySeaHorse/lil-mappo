import { describe, expect, it } from 'vitest';
import { calculateBearing, extractLineCoords } from '@/engine/geoUtils';
import { getRoutePath } from '@/engine/routePath';
import type { RouteItem } from '@/store/types';
import {
  bucketInstanceMatrix,
  globeGeoJSONMatrix,
  headingOf,
  mapboxDrawPaths,
  modelSourceMatrix,
} from '@/test/mapboxModelMath';
import heathrowMunich from './__fixtures__/heathrowMunichFlight.json';
import londonColombo from './__fixtures__/londonColomboFlight.json';
import { RouteRenderer } from './RouteRenderer';
import { routeTiming } from './routeTiming';
import { createModelLayerMap, type Projection } from './testMapboxModelLayer';

/**
 * The plane must be DRAWN facing along its flight: not merely given a heading somewhere, but
 * given it in a way Mapbox's model draw path actually applies, in globe and mercator projection,
 * the moment the playhead lands, with no camera move to rebuild tiles afterwards.
 *
 * Earlier fixes wrote the heading as a paint value, then as a feature property; both passed
 * mock-map tests yet the plane still pointed the wrong way, because the mocks never asked how
 * Mapbox draws it. These tests answer that with Mapbox's own placement math (testMapboxModelLayer).
 *
 * Fixtures: the flight routes of two real projects (globe projection) that showed the bug.
 */

const FIXTURES = {
  'London Heathrow to Munich (plane 16.76x)': heathrowMunich.route,
  'London to Colombo, an older save (plane 23.6x)': londonColombo.route,
} as unknown as Record<string, RouteItem>;

const VEHICLE_LAYER = (route: RouteItem) => `vehicle-layer-${route.id}`;
const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** The route's own direction at progress `u`: the bearing across 40 m of it. */
function routeBearing(route: RouteItem, u: number): number {
  const path = getRoutePath(extractLineCoords(route.geojson));
  const e = 20 / path.lengthM;
  return calculateBearing(path.pointAt(Math.max(0, u - e)), path.pointAt(Math.min(1, u + e)));
}

/** Playhead time at `f` of the way through the route's draw. */
const timeAt = (route: RouteItem, f: number) => route.startTime + f * (route.endTime - route.startTime);

function expectFacingRoute(
  setup: ReturnType<typeof createModelLayerMap>,
  route: RouteItem,
  time: number,
  projection: Projection,
) {
  const heading = setup.drawnHeading(VEHICLE_LAYER(route), projection);
  const expected = routeBearing(route, routeTiming(route, time).progress);
  expect(heading, `drawn heading at t=${time.toFixed(2)}s (${projection})`).not.toBeNull();
  expect(apart(heading!, expected), `drawn ${heading!.toFixed(1)} vs route ${expected.toFixed(1)} at t=${time.toFixed(2)}s (${projection})`)
    .toBeLessThan(2);
}

describe('mapbox-gl model draw paths these tests mirror', () => {
  // If one of these fails after a mapbox-gl upgrade, re-read the draw code and update
  // src/test/mapboxModelMath.ts and testMapboxModelLayer.ts to match it.
  const paths = mapboxDrawPaths();

  it('a GeoJSON model layer on the globe rebuilds its rotation from the axis of the baked one, dropping the angle', () => {
    expect(paths.geojson).toContain('getAxisAngle(rotation, rotationQuat);');
    expect(paths.geojson).toMatch(/calculateModelMatrix\(modelMatrix, model, painter\.transform, position, rotation, scale, translation/);
  });

  it('a model-source layer is placed at draw time from the model and the current model-rotation', () => {
    expect(paths.modelSource).toContain('layer.paint.get("model-rotation").evaluate(modelFeature, modelFeatureState)');
    expect(paths.modelSource).toContain('model.computeModelMatrix(painter, rotation, scale, translation');
    expect(paths.modelMatrix).toContain('orientation[2] + (rotation ? rotation[2] : 0)');
  });
});

describe("Mapbox's placement math", () => {
  it.each([0, 45, 90, 107.5, 180, 270, 359.99])('a GeoJSON model faces %s degrees in mercator, but not on the globe', (heading) => {
    const scale = [16.76, 16.76, 16.76];
    expect(apart(headingOf(bucketInstanceMatrix([0, 0, heading], scale)), heading)).toBeLessThan(1e-6);
    // On the globe the heading collapses to within a degree of north: the bug users saw.
    expect(apart(headingOf(globeGeoJSONMatrix([0, 0, heading], scale)), 0)).toBeLessThan(1);
  });

  it.each([0, 45, 90, 107.5, 180, 270, 359.99, -90])('a model-source model faces %s degrees from its orientation, in any projection', (heading) => {
    const m = modelSourceMatrix([0, 0, heading], [0, 0, 0], [23.6, 23.6, 23.6]);
    expect(apart(headingOf(m), heading)).toBeLessThan(1e-6);
  });
});

describe.each(Object.entries(FIXTURES))('the plane on %s is drawn facing along the flight', (_name, route) => {
  describe.each(['globe', 'mercator'] as const)('in %s projection', (projection) => {
    it('when the playhead jumps around (0 -> 0.5 -> 0.9 -> back), pauses, and plays through', () => {
      const setup = createModelLayerMap();
      const renderer = new RouteRenderer(setup.map, route);
      renderer.mount();
      for (const f of [0, 0.5, 0.9, 0.5, 0.1, 0.1, 0.75, 0.3]) {
        const t = timeAt(route, f);
        renderer.render(t);
        expectFacingRoute(setup, route, t, projection);
      }
      // Pause: the same frame rendered again changes nothing.
      const t = timeAt(route, 0.3);
      renderer.render(t);
      const writes = setup.double.setPaintProperty.mock.calls.length + (setup.double.triggerRepaint.mock.calls.length);
      renderer.render(t);
      expect(setup.double.setPaintProperty.mock.calls.length + setup.double.triggerRepaint.mock.calls.length).toBe(writes);
      expectFacingRoute(setup, route, t, projection);
      // Play through.
      for (let k = 0; k <= 40; k++) {
        const time = timeAt(route, k / 40);
        renderer.render(time);
        expectFacingRoute(setup, route, time, projection);
      }
    });

    it('after its layer and source are recreated: remount, marker resized, swapped to a dot and back', () => {
      const setup = createModelLayerMap();
      const renderer = new RouteRenderer(setup.map, route);
      renderer.mount();
      renderer.render(timeAt(route, 0.6));
      expectFacingRoute(setup, route, timeAt(route, 0.6), projection);

      // Style reload: everything is removed and mounted again.
      renderer.dispose();
      renderer.mount();
      renderer.render(timeAt(route, 0.4));
      expectFacingRoute(setup, route, timeAt(route, 0.4), projection);

      const vehicle = route.calculation!.vehicle!;
      const resized = { ...route, calculation: { ...route.calculation!, vehicle: { ...vehicle, scale: vehicle.scale * 2 } } };
      renderer.setRoute(resized);
      renderer.render(timeAt(route, 0.8));
      expectFacingRoute(setup, resized, timeAt(route, 0.8), projection);

      const dot = { ...route, calculation: { ...route.calculation!, vehicle: { ...vehicle, type: 'dot' as const } } };
      renderer.setRoute(dot);
      renderer.render(timeAt(route, 0.2));
      renderer.setRoute(route);
      renderer.render(timeAt(route, 0.2));
      expectFacingRoute(setup, route, timeAt(route, 0.2), projection);
      renderer.dispose();
    });
  });

  it('adds sources and layers Mapbox accepts', () => {
    const setup = createModelLayerMap();
    const renderer = new RouteRenderer(setup.map, route);
    renderer.mount();
    renderer.render(timeAt(route, 0.5));
    expect(setup.validate()).toEqual([]);
  });

  it('never turns the plane through model-rotation (guard)', () => {
    // A heading in model-rotation does not reach the drawn plane: on a GeoJSON source Mapbox bakes
    // it into tile buckets (a paint write is only picked up when the camera rebuilds the tile, and
    // on the globe it is dropped altogether), so the plane pointed the wrong way until the camera
    // moved, then went wrong again. The heading must travel with the model's position instead.
    const setup = createModelLayerMap();
    const renderer = new RouteRenderer(setup.map, route);
    renderer.mount();
    for (const f of [0, 0.25, 0.5, 0.9, 0.1]) renderer.render(timeAt(route, f));
    renderer.dispose();
    renderer.mount();
    renderer.render(timeAt(route, 0.7));

    const rotationWrites = setup.double.setPaintProperty.mock.calls
      .filter(([id, prop]) => id === VEHICLE_LAYER(route) && prop === 'model-rotation');
    expect(rotationWrites).toEqual([]);
    for (const [spec] of setup.double.addLayer.mock.calls) {
      if (spec.id !== VEHICLE_LAYER(route)) continue;
      const rotation = spec.paint?.['model-rotation'];
      // Absent or a constant: never read from the data, which Mapbox bakes per tile.
      expect(rotation === undefined || (Array.isArray(rotation) && rotation.every((v: unknown) => v === 0))).toBe(true);
    }
  });
});
