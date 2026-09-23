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

describe("BoundaryRenderer animation style switching and state management", () => {
  it("updates stroke source to full geometry when switching mid-draw to Off", () => {
    const { map } = createMapDouble();
    const renderer = new BoundaryRenderer(map, sampleBoundary);
    renderer.mount();

    const strokeSource = map.getSource("boundary-stroke-test-boundary")!;

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
    expect(fullCallData.features[0].geometry.coordinates).toEqual(sampleBoundary.geojson!.coordinates);
  });

  it("updates stroke source to full geometry when switching mid-draw to Fade-in", () => {
    const { map } = createMapDouble();
    const renderer = new BoundaryRenderer(map, sampleBoundary);
    renderer.mount();

    const strokeSource = map.getSource("boundary-stroke-test-boundary")!;

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
    expect(fadeCallData.features[0].geometry.coordinates).toEqual(sampleBoundary.geojson!.coordinates);
  });

  it("populates full geometry and displays boundary when switched to Off while at t=0", () => {
    const { map, layers } = createMapDouble();
    const delayedBoundary: BoundaryItem = {
      ...sampleBoundary,
      startTime: 2,
      endTime: 10,
    };
    const renderer = new BoundaryRenderer(map, delayedBoundary);
    renderer.mount();

    const strokeSource = map.getSource("boundary-stroke-test-boundary")!;

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
    expect(activeData.features[0].geometry.coordinates).toEqual(sampleBoundary.geojson!.coordinates);

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
    const { map } = createMapDouble();
    const staticBoundary: BoundaryItem = {
      ...sampleBoundary,
      style: {
        ...sampleBoundary.style,
        animateStroke: false,
      },
    };
    const renderer = new BoundaryRenderer(map, staticBoundary);
    renderer.mount();

    const strokeSource = map.getSource("boundary-stroke-test-boundary")!;

    renderer.render(2);
    const countAfterFirstRender = strokeSource.setData.mock.calls.length;

    renderer.render(3);
    renderer.render(4);
    renderer.render(5);

    // Should NOT have called setData on subsequent frames while remaining static
    expect(strokeSource.setData.mock.calls.length).toBe(countAfterFirstRender);
  });
});
