import type { Map as MapboxMap } from "mapbox-gl";
import { describe, expect, it, vi } from "vitest";
import type { BoundaryItem } from "@/store/types";
import { BoundaryRenderer } from "./BoundaryRenderer";

function createMapDouble() {
  const layers = new Map<string, { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown> }>();
  const sources = new Map<string, { type: "geojson"; setData: ReturnType<typeof vi.fn> }>();

  const map = {
    layers,
    sources,
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
