import type { Map as MapboxMap } from "mapbox-gl";
import { describe, expect, it, vi } from "vitest";
import type { RouteItem } from "@/store/types";
import { RouteRenderer } from "./RouteRenderer";

function createMapDouble() {
  const layers = new Map<string, { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }>();
  const sources = new Map<string, { type: "geojson"; setData: ReturnType<typeof vi.fn> }>();
  const models = new Set<string>();

  const map = {
    layers,
    sources,
    models,
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }) => {
      layers.set(layer.id, layer);
    }),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getLayoutProperty: vi.fn((id: string, prop: string) => layers.get(id)?.layout?.[prop]),
    setLayoutProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) {
        l.layout = { ...(l.layout || {}), [prop]: val };
      }
    }),
    setPaintProperty: vi.fn((id: string, prop: string, val: unknown) => {
      const l = layers.get(id);
      if (l) {
        l.paint = { ...(l.paint || {}), [prop]: val };
      }
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string) => sources.set(id, { type: "geojson", setData: vi.fn() })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    hasModel: vi.fn((id: string) => models.has(id)),
    addModel: vi.fn((id: string) => models.add(id)),
  };

  return { map: map as unknown as MapboxMap, ...map };
}

describe("RouteRenderer vehicle 3D model positioning", () => {
  it("mounts and renders plane vehicle model at [0, 0, 0] translation without Z elevation", () => {
    const route: RouteItem = {
      kind: "route",
      id: "flight-route",
      name: "NYC to Paris Flight",
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [-74.006, 40.7128],
              [-35.0, 50.0],
              [2.3522, 48.8566],
            ],
          },
        }],
      },
      startTime: 0,
      endTime: 10,
      style: {
        color: "#3b82f6",
        width: 3,
        glow: false,
        glowColor: "#3b82f6",
        glowWidth: 6,
        trailFade: false,
        trailFadeLength: 0.2,
        dashPattern: null,
        animationType: "draw",
      },
      easing: "linear",
      calculation: {
        mode: "flight",
        startPoint: [-74.006, 40.7128],
        endPoint: [2.3522, 48.8566],
        vehicle: {
          enabled: true,
          type: "plane",
          modelId: "",
          scale: 1,
        },
      },
    };

    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, route);

    renderer.mount();

    expect(double.addModel).toHaveBeenCalledWith("plane", "/models/airplane.glb");
    const vehicleLayer = double.layers.get("vehicle-layer-flight-route");
    expect(vehicleLayer).toBeDefined();
    expect(vehicleLayer?.type).toBe("model");
    expect(vehicleLayer?.layout?.["model-id"]).toBe("plane");
    expect(vehicleLayer?.paint?.["model-translation"]).toEqual([0, 0, 0]);

    // Render midway through flight
    renderer.render(5);

    // Verify model-translation was updated to [0, 0, 0] (ground level, no Z elevation)
    expect(double.setPaintProperty).toHaveBeenCalledWith(
      "vehicle-layer-flight-route",
      "model-translation",
      [0, 0, 0]
    );

    renderer.dispose();
    expect(double.layers.has("vehicle-layer-flight-route")).toBe(false);
    expect(double.sources.has("vehicle-source-flight-route")).toBe(false);
  });

  it("keeps model-translation at [0, 0, 0] even if coordinates contain legacy 3D altitude", () => {
    const legacy3DRoute: RouteItem = {
      kind: "route",
      id: "legacy-3d-route",
      name: "Legacy 3D Route",
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [0, 0, 1000],
              [1, 1, 50000],
              [2, 2, 0],
            ],
          },
        }],
      },
      startTime: 0,
      endTime: 10,
      style: {
        color: "#ff0000",
        width: 4,
        glow: false,
        glowColor: "#ff0000",
        glowWidth: 6,
        trailFade: false,
        trailFadeLength: 0.2,
        dashPattern: null,
        animationType: "draw",
      },
      easing: "linear",
      calculation: {
        mode: "flight",
        startPoint: [0, 0],
        endPoint: [2, 2],
        vehicle: {
          enabled: true,
          type: "plane",
          modelId: "",
          scale: 1,
        },
      },
    };

    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, legacy3DRoute);

    renderer.mount();
    renderer.render(5);

    expect(double.setPaintProperty).toHaveBeenCalledWith(
      "vehicle-layer-legacy-3d-route",
      "model-translation",
      [0, 0, 0]
    );

    renderer.dispose();
  });
});

describe("RouteRenderer GeoJSON-driven line head and vehicle alignment", () => {
  const sampleRoute: RouteItem = {
    kind: "route",
    id: "sync-test-route",
    name: "Sync Test Route",
    geojson: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [-73.9851, 40.7488], // Empire State
            [-73.9800, 40.7550],
            [-73.9712, 40.7614], // Central Park
          ],
        },
      }],
    },
    startTime: 0,
    endTime: 10,
    style: {
      color: "#ff6600",
      width: 4,
      glow: true,
      glowColor: "#ffaa00",
      glowWidth: 10,
      trailFade: false,
      trailFadeLength: 0.2,
      dashPattern: null,
      animationType: "draw",
    },
    easing: "linear",
    calculation: {
      mode: "manual",
      startPoint: [-73.9851, 40.7488],
      endPoint: [-73.9712, 40.7614],
      vehicle: {
        enabled: true,
        type: "dot",
        modelId: "",
        scale: 1,
      },
    },
  };

  it("positions vehicle dot at coordinates[0] at progress 0 (never at [0, 0])", () => {
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, sampleRoute);
    renderer.mount();

    // Render at progress 0
    renderer.render(0);

    const vehicleSource = double.sources.get("vehicle-source-sync-test-route");
    expect(vehicleSource).toBeDefined();

    const lastVehicleCall = vehicleSource!.setData.mock.calls.at(-1)?.[0];
    expect(lastVehicleCall).toBeDefined();
    expect(lastVehicleCall.geometry.type).toBe("Point");
    expect(lastVehicleCall.geometry.coordinates[0]).toBeCloseTo(-73.9851, 4);
    expect(lastVehicleCall.geometry.coordinates[1]).toBeCloseTo(40.7488, 4);

    const mainSource = double.sources.get("route-sync-test-route");
    const lastMainCall = mainSource!.setData.mock.calls.at(-1)?.[0];
    expect(lastMainCall).toBeDefined();
    const coords = lastMainCall.features[0].geometry.coordinates;
    // Main source line ends at the exact same coordinate
    const lineHead = coords[coords.length - 1];
    expect(lineHead[0]).toBeCloseTo(lastVehicleCall.geometry.coordinates[0], 5);
    expect(lineHead[1]).toBeCloseTo(lastVehicleCall.geometry.coordinates[1], 5);

    renderer.dispose();
  });

  it("locks vehicle position to the exact line head coordinate at progress 0.5", () => {
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, sampleRoute);
    renderer.mount();

    // Render midway (progress 0.5)
    renderer.render(5);

    const vehicleSource = double.sources.get("vehicle-source-sync-test-route");
    const mainSource = double.sources.get("route-sync-test-route");

    const vehicleData = vehicleSource!.setData.mock.calls.at(-1)?.[0];
    const mainData = mainSource!.setData.mock.calls.at(-1)?.[0];

    const vehiclePos = vehicleData.geometry.coordinates;
    const lineCoords = mainData.features[0].geometry.coordinates;
    const lineEnd = lineCoords[lineCoords.length - 1];

    expect(vehiclePos[0]).toBeCloseTo(lineEnd[0], 6);
    expect(vehiclePos[1]).toBeCloseTo(lineEnd[1], 6);

    // Verify glowSource received the exact same sliced data
    const glowSource = double.sources.get("route-glow-sync-test-route");
    const glowData = glowSource!.setData.mock.calls.at(-1)?.[0];
    expect(glowData.features[0].geometry.coordinates).toEqual(lineCoords);

    renderer.dispose();
  });

  it("hides line and vehicle before route startTime", () => {
    const double = createMapDouble();
    const delayedRoute = { ...sampleRoute, startTime: 5, endTime: 15 };
    const renderer = new RouteRenderer(double.map, delayedRoute);
    renderer.mount();

    // Render before startTime
    renderer.render(2);

    expect(double.setLayoutProperty).toHaveBeenCalledWith(
      "route-layer-sync-test-route",
      "visibility",
      "none"
    );
    expect(double.setLayoutProperty).toHaveBeenCalledWith(
      "vehicle-layer-sync-test-route",
      "visibility",
      "none"
    );

    const mainSource = double.sources.get("route-sync-test-route");
    const lastCall = mainSource!.setData.mock.calls.at(-1)?.[0];
    expect(lastCall.features).toHaveLength(0);

    renderer.dispose();
  });

  it("supports navigation animation type slicing remaining route", () => {
    const navRoute: RouteItem = {
      ...sampleRoute,
      style: {
        ...sampleRoute.style,
        animationType: "navigation",
      },
    };
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, navRoute);
    renderer.mount();

    renderer.render(5); // progress = 0.5

    const mainSource = double.sources.get("route-sync-test-route");
    const vehicleSource = double.sources.get("vehicle-source-sync-test-route");

    const lineData = mainSource!.setData.mock.calls.at(-1)?.[0];
    const vehicleData = vehicleSource!.setData.mock.calls.at(-1)?.[0];

    const lineCoords = lineData.features[0].geometry.coordinates;
    const lineStart = lineCoords[0];
    const vehiclePos = vehicleData.geometry.coordinates;

    // In navigation mode, line starts at vehicle and ends at destination
    expect(lineStart[0]).toBeCloseTo(vehiclePos[0], 5);
    expect(lineStart[1]).toBeCloseTo(vehiclePos[1], 5);
    expect(lineCoords[lineCoords.length - 1][0]).toBeCloseTo(-73.9712, 4);

    renderer.dispose();
  });

  it("handles reverse exit animation by shrinking route towards end", () => {
    const reverseRoute: RouteItem = {
      ...sampleRoute,
      exitAnimation: "reverse",
      endTime: 10,
    };
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, reverseRoute);
    renderer.mount();

    // Full line at endTime
    renderer.render(10);
    const fullMainData = double.sources.get("route-sync-test-route")!.setData.mock.calls.at(-1)?.[0];
    expect(fullMainData).toEqual(reverseRoute.geojson);

    // 50% exit progress (EXIT_DURATION = 0.5, so at time 10.25 exitProgress = 0.5)
    renderer.render(10.25);
    const exitData = double.sources.get("route-sync-test-route")!.setData.mock.calls.at(-1)?.[0];
    const exitCoords = exitData.features[0].geometry.coordinates;

    // Route should end at destination but start midway
    expect(exitCoords[exitCoords.length - 1][0]).toBeCloseTo(-73.9712, 4);
    expect(exitCoords[0][0]).not.toBeCloseTo(-73.9851, 3);

    // After exit completes (at 10.6), source is cleared
    renderer.render(10.6);
    const clearedData = double.sources.get("route-sync-test-route")!.setData.mock.calls.at(-1)?.[0];
    expect(clearedData.features).toHaveLength(0);

    renderer.dispose();
  });
});

