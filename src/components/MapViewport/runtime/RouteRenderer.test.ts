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
