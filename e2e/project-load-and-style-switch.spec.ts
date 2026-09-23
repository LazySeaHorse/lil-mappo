import { expect, test, type Page } from "@playwright/test";

const TEST_DEM = {
  tilejson: "2.2.0",
  name: "terrain-dem",
  minzoom: 0,
  maxzoom: 14,
  tiles: ["https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1/{z}/{x}/{y}.webp"],
};

const TEST_STYLE_STREETS = {
  version: 8,
  name: "Streets Test Style",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#ffffff" },
    },
  ],
};

const TEST_STYLE_SATELLITE = {
  version: 8,
  name: "Satellite Test Style",
  sources: {},
  layers: [
    {
      id: "background-sat",
      type: "background",
      paint: { "background-color": "#000000" },
    },
  ],
};

const PARIS_PROJECT = {
  schemaVersion: 1,
  id: "paris-previous-project",
  name: "Paris Previous Project",
  duration: 10,
  fps: 30,
  resolution: [1280, 720] as [number, number],
  aspectRatio: "16:9" as const,
  exportResolution: "720p" as const,
  isVertical: false,
  projection: "globe",
  lightPreset: "day",
  starIntensity: 0.6,
  fogColor: null,
  terrainExaggeration: 1.5,
  mapCenter: [2.3522, 48.8566],
  itemOrder: ["camera-track", "route-paris", "boundary-paris"],
  items: {
    "camera-track": {
      kind: "camera",
      id: "camera-track",
      keyframes: [
        {
          id: "kf-paris-0",
          time: 0,
          camera: {
            center: [2.3522, 48.8566],
            zoom: 12,
            pitch: 0,
            bearing: 0,
            altitude: null,
          },
          easing: "linear",
          followRoute: null,
        },
      ],
    },
    "route-paris": {
      kind: "route",
      id: "route-paris",
      name: "Paris Route",
      geojson: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: [
                [2.3522, 48.8566],
                [2.3600, 48.8600],
              ],
            },
          },
        ],
      },
      startTime: 0,
      endTime: 5,
      style: {
        color: "#3b82f6",
        width: 4,
        glow: false,
        glowColor: "#3b82f6",
        glowWidth: 12,
        trailFade: false,
        trailFadeLength: 0.3,
        dashPattern: null,
        animationType: "draw",
      },
      easing: "easeInOutQuad",
      calculation: {
        mode: "car",
        startPoint: [2.3522, 48.8566],
        endPoint: [2.3600, 48.8600],
      },
    },
    "boundary-paris": {
      kind: "boundary",
      id: "boundary-paris",
      placeName: "Paris Region",
      geojson: {
        type: "Polygon",
        coordinates: [
          [
            [2.30, 48.80],
            [2.40, 48.80],
            [2.40, 48.90],
            [2.30, 48.90],
            [2.30, 48.80],
          ],
        ],
      },
      resolveStatus: "resolved",
      startTime: 0,
      endTime: 5,
      style: {
        strokeColor: "#ff0000",
        fillColor: "#ff0000",
        strokeWidth: 3,
        glow: false,
        fillOpacity: 0.3,
        animateStroke: false,
        animationStyle: "fade",
        traceLength: 0.1,
      },
      easing: "easeInOutCubic",
    },
  },
};

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function stubMapboxServices(page: Page) {
  // Wildcard fallback first (lowest precedence)
  await page.route("https://api.mapbox.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://api.mapbox.com/raster/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG }),
  );
  await page.route("https://api.mapbox.com/v4/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_DEM) }),
  );
  // Style mocks registered after wildcard so they take precedence
  await page.route("https://api.mapbox.com/styles/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("satellite")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE_SATELLITE) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE_STREETS) });
  });
}

async function seedPreviousProjectDraft(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
    window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
    (window as unknown as { __E2E__?: boolean }).__E2E__ = true;
  });

  // Navigate to load the app and establish origin
  await page.goto("/");
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();

  // Populate IndexedDB with the previous project draft and await write completion
  await page.evaluate(async (draft) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("LilMapWorkingDraftDB", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts", { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("drafts", "readwrite");
        tx.objectStore("drafts").put({
          key: "current",
          project: draft,
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, PARIS_PROJECT);

  // Reload the page to simulate user opening the app and hydrating the previous project
  await page.reload();
}

test.describe("project load and map style switching", () => {
  test("1. opening the app with a previous project initializes camera at project location", async ({ page }) => {
    await stubMapboxServices(page);
    await seedPreviousProjectDraft(page);

    await page.goto("/");
    await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
    await page.waitForFunction(() => {
      const map = (window as unknown as { __mapInstance?: { isStyleLoaded: () => boolean; getCenter: () => { lng: number; lat: number } } }).__mapInstance;
      return map && map.isStyleLoaded();
    });

    // Verify map camera is positioned at the project's time 0 camera keyframe (Paris: [2.3522, 48.8566]), NOT default New York [-73.97, 40.77]
    const center = await page.evaluate(() => {
      const map = (window as unknown as { __mapInstance?: { getCenter: () => { lng: number; lat: number } } }).__mapInstance;
      return map ? map.getCenter() : null;
    });

    expect(center).not.toBeNull();
    // In buggy code: center is [-73.97, 40.77] (New York) because initialViewState is hardcoded and driveCamera is not called on load
    expect(center!.lng).toBeCloseTo(2.3522, 1);
    expect(center!.lat).toBeCloseTo(48.8566, 1);
  });

  test("2. switching map styles preserves routes and boundaries on the map", async ({ page }) => {
    await stubMapboxServices(page);
    await seedPreviousProjectDraft(page);

    await page.goto("/");
    await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
    await page.waitForFunction(() => {
      const map = (window as unknown as { __mapInstance?: { isStyleLoaded: () => boolean } }).__mapInstance;
      return map && map.isStyleLoaded();
    });

    // Initial layers and sources must be present and populated
    const initialLayers = await page.evaluate(() => {
      const map = (window as unknown as { __mapInstance?: any }).__mapInstance!;
      const fillSource = map.getSource("boundary-fill-boundary-paris")?._data;
      const routeSource = map.getSource("route-route-paris")?._data;
      return {
        routeLayer: Boolean(map.getLayer("route-layer-route-paris")),
        boundaryFill: Boolean(map.getLayer("boundary-fill-layer-boundary-paris")),
        boundaryStroke: Boolean(map.getLayer("boundary-stroke-layer-boundary-paris")),
        boundaryFeatures: fillSource?.features?.length ?? 0,
        routeFeatures: routeSource?.features?.length ?? 0,
      };
    });
    expect(initialLayers.routeLayer).toBe(true);
    expect(initialLayers.boundaryFill).toBe(true);
    expect(initialLayers.boundaryStroke).toBe(true);
    expect(initialLayers.boundaryFeatures).toBeGreaterThan(0);
    expect(initialLayers.routeFeatures).toBeGreaterThan(0);

    // Switch map style to satellite
    await page.evaluate(() => {
      const store = (window as unknown as { __projectStore: { getState: () => { setMapStyle: (s: string) => void } } }).__projectStore;
      store.getState().setMapStyle("satellite");
    });

    // Wait for the new style to finish loading
    await page.waitForFunction(() => {
      const map = (window as unknown as { __mapInstance?: { isStyleLoaded: () => boolean } }).__mapInstance;
      return map && map.isStyleLoaded();
    });
    await page.waitForTimeout(500);

    // After switching styles, route and boundary layers MUST be present and populated on the new style
    const afterSwitchLayers = await page.evaluate(() => {
      const map = (window as unknown as { __mapInstance?: any }).__mapInstance!;
      const fillSource = map.getSource("boundary-fill-boundary-paris")?._data;
      const routeSource = map.getSource("route-route-paris")?._data;
      return {
        isStyleLoaded: map.isStyleLoaded(),
        routeLayer: Boolean(map.getLayer("route-layer-route-paris")),
        boundaryFill: Boolean(map.getLayer("boundary-fill-layer-boundary-paris")),
        boundaryStroke: Boolean(map.getLayer("boundary-stroke-layer-boundary-paris")),
        boundaryFeatures: fillSource?.features?.length ?? 0,
        routeFeatures: routeSource?.features?.length ?? 0,
      };
    });

    expect(afterSwitchLayers.routeLayer).toBe(true);
    expect(afterSwitchLayers.boundaryFill).toBe(true);
    expect(afterSwitchLayers.boundaryStroke).toBe(true);
    expect(afterSwitchLayers.boundaryFeatures).toBeGreaterThan(0);
    expect(afterSwitchLayers.routeFeatures).toBeGreaterThan(0);
  });
});
