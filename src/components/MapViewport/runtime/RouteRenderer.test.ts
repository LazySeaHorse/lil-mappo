import type { Map as MapboxMap } from "mapbox-gl";
import { describe, expect, it, vi } from "vitest";
import type { RouteItem } from "@/store/types";
import { RouteRenderer } from "./RouteRenderer";
import { getRoutePath } from "@/engine/routePath";

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

describe("RouteRenderer vehicle type switching", () => {
  function routeWithVehicle(type: "car" | "plane" | "dot"): RouteItem {
    return {
      kind: "route",
      id: "switch-route",
      name: "Switch",
      geojson: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
        }],
      },
      startTime: 0,
      endTime: 10,
      style: {
        color: "#3b82f6",
        width: 3,
        glow: false,
        glowWidth: 6,
        trailFade: false,
        trailFadeLength: 0.2,
        dashPattern: null,
        animationType: "draw",
      },
      easing: "linear",
      calculation: {
        mode: "car",
        startPoint: [0, 0],
        endPoint: [1, 1],
        vehicle: { enabled: true, type, modelId: "", scale: 1 },
      },
    };
  }

  it.each([
    ["car", "plane"],
    ["plane", "car"],
  ] as const)("renders the %s -> %s model after switching the vehicle type", (from, to) => {
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, routeWithVehicle(from));
    renderer.mount();
    expect(double.layers.get("vehicle-layer-switch-route")?.layout?.["model-id"]).toBe(from);

    renderer.setRoute(routeWithVehicle(to));

    const layer = double.layers.get("vehicle-layer-switch-route");
    expect(layer?.type).toBe("model");
    expect(layer?.layout?.["model-id"]).toBe(to);
  });

  it("recolors the dot vehicle when the route color changes", () => {
    const double = createMapDouble();
    const route = routeWithVehicle("dot");
    const renderer = new RouteRenderer(double.map, route);
    renderer.mount();
    expect(double.layers.get("vehicle-layer-switch-route")?.paint?.["circle-color"]).toBe("#3b82f6");

    renderer.setRoute({ ...route, style: { ...route.style, color: "#ef4444" } });

    expect(double.layers.get("vehicle-layer-switch-route")?.paint?.["circle-color"]).toBe("#ef4444");
  });

  it.each(["dot", "car"] as const)("creates the %s route layers without paint transitions", (type) => {
    const double = createMapDouble();
    new RouteRenderer(double.map, routeWithVehicle(type)).mount();
    const none = { duration: 0, delay: 0 };

    for (const id of ["route-layer-switch-route", "route-glow-layer-switch-route"]) {
      const paint = double.layers.get(id)?.paint;
      for (const prop of ["line-opacity", "line-color", "line-width"]) {
        expect(paint?.[`${prop}-transition`], `${id} ${prop}`).toEqual(none);
      }
    }
    const vehicle = double.layers.get("vehicle-layer-switch-route")?.paint;
    const props = type === "dot"
      ? ["circle-radius", "circle-color", "circle-opacity"]
      : ["model-opacity", "model-rotation", "model-scale", "model-translation"];
    for (const prop of props) expect(vehicle?.[`${prop}-transition`], prop).toEqual(none);
  });
});

describe("RouteRenderer trim-driven line", () => {
  const COORDS = [[0, 0], [0, 10], [0, 80]]; // large latitude span: mercator progress != geodesic progress
  const sampleRoute: RouteItem = {
    kind: "route",
    id: "sync-test-route",
    name: "Sync Test Route",
    geojson: {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: COORDS } }],
    },
    startTime: 0,
    endTime: 10,
    style: {
      color: "#ff6600",
      width: 4,
      glow: true,
      glowWidth: 10,
      trailFade: false,
      trailFadeLength: 0.2,
      dashPattern: null,
      animationType: "draw",
    },
    easing: "linear",
    calculation: {
      mode: "car",
      startPoint: [0, 0],
      endPoint: [0, 80],
      vehicle: { enabled: true, type: "dot", modelId: "", scale: 1 },
    },
  };
  const MAIN = "route-layer-sync-test-route";
  const GLOW = "route-glow-layer-sync-test-route";
  const lp = (u: number) => getRoutePath(COORDS).lineProgressAt(u);
  const withStyle = (style: Partial<RouteItem["style"]>, extra: Partial<RouteItem> = {}): RouteItem =>
    ({ ...sampleRoute, ...extra, style: { ...sampleRoute.style, ...style } });
  const trimOf = (double: ReturnType<typeof createMapDouble>, id = MAIN) => double.layers.get(id)?.paint?.["line-trim-offset"];
  const mounted = (route: RouteItem) => {
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, route);
    renderer.mount();
    return { double, renderer, main: double.sources.get("route-sync-test-route")! };
  };

  it("uploads the whole line once, to a lineMetrics source shared by the main and glow layers", () => {
    const { double, renderer, main } = mounted(sampleRoute);
    expect(double.addSource).toHaveBeenCalledWith("route-sync-test-route", expect.objectContaining({ lineMetrics: true }));
    expect(double.sources.has("route-glow-sync-test-route")).toBe(false);
    expect(double.layers.get(GLOW)?.source).toBe("route-sync-test-route");
    expect(main.setData).toHaveBeenCalledTimes(1);
    const uploaded = main.setData.mock.calls[0][0];
    expect(uploaded.features).toHaveLength(1);
    expect(uploaded.features[0].geometry).toEqual({ type: "LineString", coordinates: COORDS });

    for (let t = 0; t <= 12; t += 0.25) renderer.render(t);
    expect(main.setData).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it("draw hides [trimAt(p), 1] on the main and glow layers", () => {
    const { double, renderer } = mounted(sampleRoute);
    renderer.render(5);
    expect(lp(0.5)).not.toBeCloseTo(0.5, 2);
    expect(trimOf(double)).toEqual([lp(0.5), 1]);
    expect(trimOf(double, GLOW)).toEqual([lp(0.5), 1]);
    renderer.render(0);
    expect(trimOf(double)).toEqual([0, 1]);
    renderer.dispose();
  });

  it("does not write the glow trim while the glow is off", () => {
    const { double, renderer } = mounted(withStyle({ glow: false }));
    renderer.render(5);
    expect(trimOf(double)).toEqual([lp(0.5), 1]);
    expect(trimOf(double, GLOW)).toBeUndefined();
    renderer.dispose();
  });

  it("clears the trim once progress reaches 1", () => {
    const { double, renderer } = mounted(sampleRoute);
    renderer.render(5);
    renderer.render(10);
    expect(trimOf(double)).toEqual([0, 0]);
    expect(trimOf(double, GLOW)).toEqual([0, 0]);
    renderer.dispose();
  });

  it("skips trim writes when the trim has not changed", () => {
    const { double, renderer } = mounted(sampleRoute);
    renderer.render(5);
    double.setPaintProperty.mockClear();
    renderer.render(5);
    expect(double.setPaintProperty).not.toHaveBeenCalledWith(MAIN, "line-trim-offset", expect.anything());
    renderer.dispose();
  });

  it("navigation hides [0, trimAt(p)] and ends fully hidden", () => {
    const { double, renderer } = mounted(withStyle({ animationType: "navigation" }));
    renderer.render(0);
    expect(trimOf(double)).toEqual([0, 0]);
    renderer.render(5);
    expect(trimOf(double)).toEqual([0, lp(0.5)]);
    expect(trimOf(double, GLOW)).toEqual([0, lp(0.5)]);
    renderer.render(10);
    expect(trimOf(double)).toEqual([0, 1]);
    renderer.dispose();
  });

  it("reverse exit hides [0, trimAt(e)] until the exit completes", () => {
    const { double, renderer, main } = mounted(withStyle({}, { exitAnimation: "reverse" }));
    renderer.render(10);
    expect(trimOf(double)).toEqual([0, 0]);
    renderer.render(10.25); // EXIT_DURATION 0.5 -> exitProgress 0.5
    expect(trimOf(double)).toEqual([0, lp(0.5)]);
    double.setLayoutProperty.mockClear();
    renderer.render(10.6);
    expect(double.setLayoutProperty).toHaveBeenCalledWith(MAIN, "visibility", "none");
    expect(main.setData).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it("hides the layers (without touching the data) before the start", () => {
    const { double, renderer, main } = mounted(withStyle({}, { startTime: 5, endTime: 15 }));
    renderer.render(2);
    expect(double.setLayoutProperty).toHaveBeenCalledWith(MAIN, "visibility", "none");
    expect(double.setLayoutProperty).toHaveBeenCalledWith("vehicle-layer-sync-test-route", "visibility", "none");
    expect(main.setData).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it("puts the vehicle at the line tip: the trim is the vehicle's mercator progress", () => {
    const { double, renderer } = mounted(sampleRoute);
    renderer.render(5);
    const [lng, lat] = double.sources.get("vehicle-source-sync-test-route")!.setData.mock.calls.at(-1)![0].geometry.coordinates;
    const want = getRoutePath(COORDS).pointAt(0.5);
    expect(lng).toBeCloseTo(want[0], 9);
    expect(lat).toBeCloseTo(want[1], 9);
    renderer.dispose();
  });

  it("re-uploads once when the geometry changes", () => {
    const { double, renderer, main } = mounted(sampleRoute);
    renderer.render(5);
    const coordinates = [[0, 0], [30, 30]];
    renderer.setRoute({ ...sampleRoute, geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }] } });
    expect(main.setData).toHaveBeenCalledTimes(2);
    expect(main.setData.mock.calls[1][0].features[0].geometry.coordinates).toEqual(coordinates);
    renderer.render(5);
    expect(trimOf(double)).toEqual([getRoutePath(coordinates).lineProgressAt(0.5), 1]);
    expect(main.setData).toHaveBeenCalledTimes(2);
    renderer.dispose();
  });

  it("re-uploads and re-applies the trim after the style is reloaded", () => {
    const { double, renderer } = mounted(sampleRoute);
    renderer.render(5);
    double.layers.clear();
    double.sources.clear();
    renderer.mount();
    const main = double.sources.get("route-sync-test-route")!;
    expect(main.setData).toHaveBeenCalledTimes(1);
    renderer.render(5);
    expect(trimOf(double)).toEqual([lp(0.5), 1]);
    renderer.dispose();
  });

  it("draws a multi-feature route as one concatenated line", () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } },
        { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [[[2, 2], [3, 3]], [[4, 4], [5, 5]]] } },
      ],
    };
    const { main } = mounted({ ...sampleRoute, geojson });
    const data = main.setData.mock.calls[0][0];
    expect(data.features).toHaveLength(1);
    expect(data.features[0].geometry.type).toBe("LineString");
    expect(data.features[0].geometry.coordinates).toEqual([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  });

  it("keeps an antimeridian-crossing route one continuous line by unwrapping longitude, and keeps altitude", () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[170, 0, 5], [-170, 10, 6], [-160, 20, 7]] } }],
    };
    const { main } = mounted({ ...sampleRoute, geojson });
    expect(main.setData.mock.calls[0][0].features[0].geometry.coordinates).toEqual([[170, 0, 5], [190, 10, 6], [200, 20, 7]]);
  });

  it("comet keeps streaming its trail through its own source and hides the main layers", () => {
    const { double, renderer, main } = mounted(withStyle({ animationType: "comet", cometTrailLength: 0.2 }));
    const comet = double.sources.get("route-comet-sync-test-route")!;
    renderer.render(5);
    expect(comet.setData).toHaveBeenCalledTimes(1);
    renderer.render(6);
    expect(comet.setData).toHaveBeenCalledTimes(2);
    expect(double.setLayoutProperty).toHaveBeenCalledWith(MAIN, "visibility", "none");
    expect(main.setData).toHaveBeenCalledTimes(1);
    renderer.dispose();
  });

  it("switching comet -> draw clears the trail and applies the trim; back to comet redraws it", () => {
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, withStyle({ animationType: "comet" }));
    renderer.mount();
    const comet = double.sources.get("route-comet-sync-test-route")!;
    renderer.render(5);
    comet.setData.mockClear();

    renderer.setRoute(withStyle({ animationType: "draw" }));
    renderer.render(5);
    expect(comet.setData).toHaveBeenCalledWith({ type: "FeatureCollection", features: [] });
    expect(trimOf(double)).toEqual([lp(0.5), 1]);
    expect(double.setLayoutProperty).toHaveBeenCalledWith(GLOW, "visibility", "visible");

    comet.setData.mockClear();
    renderer.setRoute(withStyle({ animationType: "comet" }));
    renderer.render(5);
    expect(comet.setData).toHaveBeenCalledTimes(1);
    expect(comet.setData.mock.calls[0][0].features.length).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("switching draw -> navigation rewrites the trim for the same progress", () => {
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, sampleRoute);
    renderer.mount();
    renderer.render(5);
    renderer.setRoute(withStyle({ animationType: "navigation" }));
    renderer.render(5);
    expect(trimOf(double)).toEqual([0, lp(0.5)]);
    renderer.dispose();
  });

  it("never gives line-trim-offset a paint transition", () => {
    const { double } = mounted(sampleRoute);
    expect(double.layers.get(MAIN)?.paint).not.toHaveProperty("line-trim-offset-transition");
  });
});


describe("RouteRenderer vehicle placement", () => {
  it("sits on the drawn (mercator) line: the vehicle is at RoutePath.pointAt(progress)", () => {
    const coordinates = [[0, 0], [40, 60]];
    const route = {
      kind: "route",
      id: "merc-route",
      name: "Merc",
      geojson: {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }],
      },
      startTime: 0,
      endTime: 10,
      style: { color: "#f00", width: 4, glow: false, glowWidth: 10, trailFade: false, trailFadeLength: 0.2, dashPattern: null, animationType: "draw" },
      easing: "linear",
      calculation: { mode: "car", startPoint: [0, 0], endPoint: [40, 60], vehicle: { enabled: true, type: "dot", modelId: "", scale: 1 } },
    } as unknown as RouteItem;
    const double = createMapDouble();
    const renderer = new RouteRenderer(double.map, route);
    renderer.mount();
    renderer.render(5);
    const placed = double.sources.get("vehicle-source-merc-route")!.setData.mock.calls.at(-1)?.[0].geometry.coordinates;
    const want = getRoutePath(coordinates).pointAt(0.5);
    expect(placed[0]).toBeCloseTo(want[0], 9);
    expect(placed[1]).toBeCloseTo(want[1], 9);
    expect(Math.abs(placed[1] - 30)).toBeGreaterThan(1);
    renderer.dispose();
  });
});
