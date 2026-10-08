import type { Map as MapboxMap } from "mapbox-gl";
import { describe, expect, it, vi } from "vitest";
import type { BoundaryItem } from "@/store/types";
import { BoundaryRenderer } from "./BoundaryRenderer";
import { FlagTileSource } from "./FlagTileSource";

vi.mock("./flagImages", () => ({
  hasFlag: (code: string | null) => code === "fr" || code === "de",
  loadFlagImage: vi.fn(async () => ({ width: 1280, height: 960 })),
}));

function createMapDouble() {
  const layers = new Map<string, { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }>();
  const sources = new Map<string, { type: string; setData: ReturnType<typeof vi.fn>; spec?: unknown }>();

  const map = {
    layers,
    sources,
    isStyleLoaded: vi.fn(() => true),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }, _beforeId?: string) => {
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
    addSource: vi.fn((id: string, spec?: { type?: string }) => sources.set(id, { type: spec?.type ?? "geojson", setData: vi.fn(), spec })),
    removeSource: vi.fn((id: string) => sources.delete(id)),
  };

  return { map: map as unknown as MapboxMap, ...map };
}

const sampleBoundary: BoundaryItem = {
  kind: "boundary",
  id: "test-boundary",
  placeName: "Testland",
  geojson: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
  resolveStatus: "resolved",
  startTime: 0,
  endTime: 10,
  style: {
    strokeColor: "#3b82f6",
    fillColor: "#3b82f6",
    strokeWidth: 4,
    glow: true,
    fillOpacity: 0.2,
    animateStroke: true,
    animationStyle: "draw",
    traceLength: 0.1,
    maskOutside: false,
    maskColor: "#0b0f19",
    maskOpacity: 0.85,
    fillMode: 'color',
    flagCode: null,
  },
  easing: "linear",
};

describe("BoundaryRenderer paint transitions", () => {
  it("creates every layer without paint transitions", () => {
    const { map, layers } = createMapDouble();
    new BoundaryRenderer(map, sampleBoundary).mount();
    const none = { duration: 0, delay: 0 };

    const fill = layers.get("boundary-fill-layer-test-boundary")?.paint;
    for (const prop of ["fill-color", "fill-opacity"]) expect(fill?.[`${prop}-transition`], prop).toEqual(none);
    for (const id of ["boundary-stroke-layer-test-boundary", "boundary-glow-layer-test-boundary"]) {
      const paint = layers.get(id)?.paint;
      for (const prop of ["line-color", "line-width", "line-opacity", "line-blur"]) {
        if (prop === "line-blur" && id.includes("stroke")) continue;
        expect(paint?.[`${prop}-transition`], `${id} ${prop}`).toEqual(none);
      }
    }
  });
});

describe("BoundaryRenderer animated stroke uploads", () => {
  function setup(style: Partial<BoundaryItem["style"]> = {}) {
    const { map, sources } = createMapDouble();
    const boundary: BoundaryItem = { ...sampleBoundary, style: { ...sampleBoundary.style, ...style } };
    const renderer = new BoundaryRenderer(map, boundary);
    renderer.mount();
    return { renderer, boundary, setData: sources.get("boundary-stroke-test-boundary")!.setData };
  }

  it("uploads once for repeated renders at the same time", () => {
    const { renderer, setData } = setup();
    renderer.render(5);
    renderer.render(5);
    expect(setData).toHaveBeenCalledTimes(1);
  });

  it("does not re-upload while the boundary holds at full progress or before it starts", () => {
    const { renderer, setData } = setup();
    renderer.render(0);
    renderer.render(-1);
    expect(setData).toHaveBeenCalledTimes(1);
    renderer.render(10);
    renderer.render(12);
    expect(setData).toHaveBeenCalledTimes(2);
  });

  it("uploads when progress changes", () => {
    const { renderer, setData } = setup();
    renderer.render(2);
    renderer.render(3);
    expect(setData).toHaveBeenCalledTimes(2);
  });

  it("uploads when the animation style or trace length changes", () => {
    const { renderer, boundary, setData } = setup({ animationStyle: "trace" });
    renderer.render(5);
    renderer.setBoundary({ ...boundary, style: { ...boundary.style, animationStyle: "trace", traceLength: 0.3 } });
    renderer.render(5);
    expect(setData).toHaveBeenCalledTimes(2);
  });

  it("re-uploads when switching static -> animated and when the geometry changes", () => {
    const { renderer, boundary, setData } = setup();
    renderer.render(5);
    renderer.setBoundary({ ...boundary, style: { ...boundary.style, animateStroke: false } });
    renderer.render(5);
    renderer.setBoundary(boundary);
    renderer.render(5);
    expect(setData).toHaveBeenCalledTimes(3);
    renderer.setBoundary({ ...boundary, geojson: { type: "Polygon", coordinates: [[[0, 0], [5, 0], [5, 5], [0, 0]]] } });
    renderer.render(5);
    expect(setData).toHaveBeenCalledTimes(4);
  });
});

describe("BoundaryRenderer animation style switching and state management", () => {
  it("updates stroke source to full geometry when switching mid-draw to Off", () => {
    const { map, sources } = createMapDouble();
    const renderer = new BoundaryRenderer(map, sampleBoundary);
    renderer.mount();

    const strokeSource = sources.get("boundary-stroke-test-boundary")!;

    // 1. Render at t=5s (50% progress in 'draw' mode)
    renderer.render(5);

    const midCallData = strokeSource.setData.mock.calls.at(-1)![0];
    expect(midCallData.features[0].geometry.type).toBe("MultiLineString");
    // Mid-draw should be partial coords
    expect(midCallData.features[0].geometry.coordinates[0].length).toBeLessThan(5);

    // 2. User switches to "Off" (animateStroke: false)
    renderer.setBoundary({
      ...sampleBoundary,
      style: {
        ...sampleBoundary.style,
        animateStroke: false,
      },
    });
    renderer.render(5);

    // strokeSource must have been updated to the full polygon geometry!
    const fullCallData = strokeSource.setData.mock.calls.at(-1)![0];
    expect(fullCallData.features[0].geometry.type).toBe("Polygon");
    expect(fullCallData.features[0].geometry.coordinates).toEqual((sampleBoundary.geojson as GeoJSON.Polygon).coordinates);
  });

  it("updates stroke source to full geometry when switching mid-draw to Fade-in", () => {
    const { map, sources } = createMapDouble();
    const renderer = new BoundaryRenderer(map, sampleBoundary);
    renderer.mount();

    const strokeSource = sources.get("boundary-stroke-test-boundary")!;

    // 1. Render at t=5s (50% progress in 'draw' mode)
    renderer.render(5);

    // 2. User switches to "Fade-in" (animateStroke: true, animationStyle: 'fade')
    renderer.setBoundary({
      ...sampleBoundary,
      style: {
        ...sampleBoundary.style,
        animateStroke: true,
        animationStyle: "fade",
      },
    });
    renderer.render(5);

    // strokeSource must have been updated to the full polygon geometry!
    const fadeCallData = strokeSource.setData.mock.calls.at(-1)![0];
    expect(fadeCallData.features[0].geometry.type).toBe("Polygon");
    expect(fadeCallData.features[0].geometry.coordinates).toEqual((sampleBoundary.geojson as GeoJSON.Polygon).coordinates);
  });

  it("populates full geometry and displays boundary when switched to Off while at t=0", () => {
    const { map, layers, sources } = createMapDouble();
    const delayedBoundary: BoundaryItem = {
      ...sampleBoundary,
      startTime: 2,
      endTime: 10,
    };
    const renderer = new BoundaryRenderer(map, delayedBoundary);
    renderer.mount();

    const strokeSource = sources.get("boundary-stroke-test-boundary")!;

    // Render at t=0 (before start)
    renderer.render(0);

    // Switch to Off at t=0
    renderer.setBoundary({
      ...delayedBoundary,
      style: {
        ...delayedBoundary.style,
        animateStroke: false,
      },
    });
    renderer.render(0);

    // Advance to t=5 (active duration)
    renderer.render(5);

    // strokeSource must contain the full polygon geometry
    const activeData = strokeSource.setData.mock.calls.at(-1)![0];
    expect(activeData.features[0].geometry.type).toBe("Polygon");
    expect(activeData.features[0].geometry.coordinates).toEqual((sampleBoundary.geojson as GeoJSON.Polygon).coordinates);

    // Stroke layer opacity must be 1 (visible)
    const strokeLayer = layers.get("boundary-stroke-layer-test-boundary");
    expect(strokeLayer?.paint?.["line-opacity"]).toBe(1);
  });

  it("does not delay fill opacity by 70% when animateStroke is false (Off)", () => {
    const { map, layers } = createMapDouble();
    const offBoundary: BoundaryItem = {
      ...sampleBoundary,
      style: {
        ...sampleBoundary.style,
        animateStroke: false,
        // animationStyle may still be left as 'draw' from before
        animationStyle: "draw",
        fillOpacity: 0.5,
      },
    };
    const renderer = new BoundaryRenderer(map, offBoundary);
    renderer.mount();

    // Render at t=2s (progress = 0.2, which is < 0.7)
    renderer.render(2);

    const fillLayer = layers.get("boundary-fill-layer-test-boundary");
    // In "Off" mode, fill should be active right away, NOT waiting until 70%
    expect(fillLayer?.paint?.["fill-opacity"]).toBe(0.5);
  });

  it("does not redundantly call setData every frame when stroke is static", () => {
    const { map, sources } = createMapDouble();
    const staticBoundary: BoundaryItem = {
      ...sampleBoundary,
      style: {
        ...sampleBoundary.style,
        animateStroke: false,
      },
    };
    const renderer = new BoundaryRenderer(map, staticBoundary);
    renderer.mount();

    const strokeSource = sources.get("boundary-stroke-test-boundary")!;

    renderer.render(2);
    const countAfterFirstRender = strokeSource.setData.mock.calls.length;

    renderer.render(3);
    renderer.render(4);
    renderer.render(5);

    // Should NOT have called setData on subsequent frames while remaining static
    expect(strokeSource.setData.mock.calls.length).toBe(countAfterFirstRender);
  });
});

describe("BoundaryRenderer flag fill", () => {
  const FLAG_LAYER = "boundary-flag-layer-test-boundary";
  const FLAG_SOURCE = "boundary-flag-test-boundary";
  const FILL_LAYER = "boundary-fill-layer-test-boundary";

  function setup(style: Partial<BoundaryItem["style"]> = {}, placement: { slot?: "bottom"; beforeId?: string } = { slot: "bottom" }) {
    const double = createMapDouble();
    const boundary: BoundaryItem = {
      ...sampleBoundary,
      style: { ...sampleBoundary.style, animateStroke: false, fillOpacity: 0.8, fillMode: "flag", flagCode: "fr", ...style },
    };
    const renderer = new BoundaryRenderer(double.map, boundary, () => placement);
    renderer.mount();
    return { ...double, renderer, boundary };
  }

  it("adds a custom flag source and a raster layer at the flag placement", () => {
    const { renderer, layers, sources, addLayer } = setup({}, { slot: "bottom" });
    renderer.render(5);
    expect(sources.get(FLAG_SOURCE)?.spec).toBeInstanceOf(FlagTileSource);
    expect(layers.get(FLAG_LAYER)).toMatchObject({ type: "raster", source: FLAG_SOURCE, slot: "bottom" });
    expect(layers.get(FLAG_LAYER)?.paint).toMatchObject({ "raster-fade-duration": 0, "raster-opacity-transition": { duration: 0, delay: 0 } });
    const call = addLayer.mock.calls.find(([layer]) => layer.id === FLAG_LAYER)!;
    expect(call[1]).toBeUndefined();
  });

  it("inserts before the anchor on classic styles", () => {
    const { renderer, addLayer, layers } = setup({}, { beforeId: "road-street" });
    renderer.render(5);
    const call = addLayer.mock.calls.find(([layer]) => layer.id === FLAG_LAYER)!;
    expect(call[1]).toBe("road-street");
    expect(layers.get(FLAG_LAYER)).not.toHaveProperty("slot");
  });

  it("scales raster opacity by fill opacity and the timing factor, and hides the colour fill", () => {
    const { renderer, layers } = setup({ animateStroke: false });
    renderer.render(-1);
    expect(layers.get(FLAG_LAYER)?.paint?.["raster-opacity"]).toBe(0);
    renderer.render(5);
    expect(layers.get(FLAG_LAYER)?.paint?.["raster-opacity"]).toBeCloseTo(0.8);
    expect(layers.get(FILL_LAYER)?.paint?.["fill-opacity"]).toBe(0);
  });

  it("follows the fade exit", () => {
    const { renderer, layers, boundary } = setup();
    renderer.setBoundary({ ...boundary, exitAnimation: "fade" });
    renderer.render(10.25);
    expect(layers.get(FLAG_LAYER)?.paint?.["raster-opacity"]).toBeCloseTo(0.4);
  });

  it("uses the colour fill only in colour mode and creates no flag layer", () => {
    const { renderer, layers, sources } = setup({ fillMode: "color" });
    renderer.render(5);
    expect(layers.has(FLAG_LAYER)).toBe(false);
    expect(sources.has(FLAG_SOURCE)).toBe(false);
    expect(layers.get(FILL_LAYER)?.paint?.["fill-opacity"]).toBeCloseTo(0.8);
  });

  it("creates no flag layer for a missing or unknown flag", () => {
    for (const flagCode of [null, "zz"]) {
      const { renderer, layers } = setup({ flagCode });
      renderer.render(5);
      expect(layers.has(FLAG_LAYER)).toBe(false);
    }
  });

  it("switches modes: removes the flag and restores the colour fill, and back", () => {
    const { renderer, layers, sources, boundary } = setup();
    renderer.render(5);
    expect(layers.has(FLAG_LAYER)).toBe(true);
    renderer.setBoundary({ ...boundary, style: { ...boundary.style, fillMode: "color" } });
    renderer.render(5);
    expect(layers.has(FLAG_LAYER)).toBe(false);
    expect(sources.has(FLAG_SOURCE)).toBe(false);
    expect(layers.get(FILL_LAYER)?.paint?.["fill-opacity"]).toBeCloseTo(0.8);
    renderer.setBoundary(boundary);
    renderer.render(5);
    expect(layers.has(FLAG_LAYER)).toBe(true);
    expect(layers.get(FLAG_LAYER)?.paint?.["raster-opacity"]).toBeCloseTo(0.8);
    expect(layers.get(FILL_LAYER)?.paint?.["fill-opacity"]).toBe(0);
  });

  it("reloads tiles when the flag or the geometry changes, not on every frame", () => {
    const { renderer, sources, boundary } = setup();
    renderer.render(5);
    const source = sources.get(FLAG_SOURCE)!.spec as FlagTileSource;
    const update = vi.fn();
    source.update = update;
    source.onAdd();
    renderer.render(6);
    expect(update).not.toHaveBeenCalled();
    renderer.setBoundary({ ...boundary, style: { ...boundary.style, flagCode: "de" } });
    renderer.render(6);
    expect(update).toHaveBeenCalledTimes(1);
    renderer.setBoundary({ ...boundary, style: { ...boundary.style, flagCode: "de" }, geojson: { type: "Polygon", coordinates: [[[0, 0], [5, 0], [5, 5], [0, 0]]] } });
    renderer.render(6);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("preloads the flag when mounted in flag mode and when the mode switches", async () => {
    const { loadFlagImage } = await import("./flagImages");
    const load = vi.mocked(loadFlagImage);
    load.mockClear();
    const { renderer, boundary } = setup({ fillMode: "color" });
    expect(load).not.toHaveBeenCalled();
    renderer.setBoundary({ ...boundary, style: { ...boundary.style, fillMode: "flag", flagCode: "de" } });
    expect(load).toHaveBeenCalledWith("de");
    load.mockClear();
    setup();
    expect(load).toHaveBeenCalledWith("fr");
  });

  it("removes the flag layer and source on dispose, and recreates them after a remount", () => {
    const { renderer, layers, sources } = setup();
    renderer.render(5);
    renderer.dispose();
    expect(layers.has(FLAG_LAYER)).toBe(false);
    expect(sources.has(FLAG_SOURCE)).toBe(false);
    expect(layers.size).toBe(0);
    renderer.mount();
    renderer.render(5);
    expect(layers.has(FLAG_LAYER)).toBe(true);
  });

  it("rebuilds the flag resources after the style was replaced under it", () => {
    const { renderer, layers, sources, map } = setup();
    renderer.render(5);
    layers.clear();
    sources.clear();
    renderer.mount();
    renderer.render(5);
    expect(layers.has(FLAG_LAYER)).toBe(true);
    expect(sources.get(FLAG_SOURCE)?.spec).toBeInstanceOf(FlagTileSource);
    expect(map.addSource).toHaveBeenCalled();
  });
});
