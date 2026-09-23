import { expect, test } from "@playwright/test";

const TEST_STYLE = {
  version: 8,
  name: "E2E test style",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#dbeafe" },
    },
  ],
};

const TEST_BOUNDARY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { display_name: "Testland, Smoke Test", type: "country" },
      geometry: {
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
    },
  ],
};

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("Boundary Animation Mode Switching", () => {
  test("switches between Draw, Off, and Fade-in without leaving partial or blank outlines", async ({ page }) => {
    // Stub external endpoints
    await page.route("https://api.mapbox.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );
    await page.route("https://api.mapbox.com/raster/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG }),
    );
    await page.route("https://api.mapbox.com/styles/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE) }),
    );
    await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
    await page.route("https://nominatim.openstreetmap.org/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_BOUNDARY) }),
    );

    await page.addInitScript(() => {
      window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
      window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
    });

    await page.goto("/");
    await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible();

    // Insert boundary
    await page.getByTitle("Add Boundary").click();
    const search = page.getByPlaceholder("Search for a place or region");
    await search.fill("Testland");
    await search.press("Enter");
    await page.getByRole("button", { name: /Testland/ }).click();
    await page.getByRole("button", { name: "Insert boundary" }).click();

    await expect(page.getByRole("heading", { name: "Boundary", exact: true })).toBeVisible();

    interface WindowWithStores {
      __mapInstance?: {
        getSource: (id: string) => { _data?: GeoJSON.FeatureCollection } | undefined;
      };
      __projectStore?: {
        getState: () => {
          items: Record<string, { kind: string }>;
          setPlayheadTime: (t: number) => void;
        };
      };
    }

    const getStrokeSourceData = async () => {
      return await page.evaluate(() => {
        const win = window as unknown as WindowWithStores;
        const map = win.__mapInstance;
        const state = win.__projectStore?.getState();
        if (!map || !state) return null;
        const boundaryId = Object.keys(state.items).find(
          (id) => state.items[id].kind === "boundary"
        );
        if (!boundaryId) return null;
        const source = map.getSource(`boundary-stroke-${boundaryId}`);
        return source?._data;
      });
    };

    const setTime = async (time: number) => {
      await page.evaluate((t) => {
        const win = window as unknown as WindowWithStores;
        win.__projectStore?.getState().setPlayheadTime(t);
      }, time);
      await page.waitForTimeout(50);
    };

    // 1. Move to mid-draw (t=2.5s) where outline is partially drawn
    await setTime(2.5);
    const midDrawData = await getStrokeSourceData();
    expect(midDrawData.features[0].geometry.type).toBe("MultiLineString");

    // 2. Switch to "Off" - should immediately become the full Polygon
    await page.getByRole("button", { name: /Off/i }).click();
    await page.waitForTimeout(50);
    const offData = await getStrokeSourceData();
    expect(offData.features[0].geometry.type).toBe("Polygon");
    expect(offData.features[0].geometry.coordinates).toEqual(TEST_BOUNDARY.features[0].geometry.coordinates);

    // 3. Switch back to "Outline" and scrub to t=2.5s again
    await page.getByRole("button", { name: /Outline/i }).click();
    await setTime(2.5);

    // 4. Switch to "Fade-in" - should immediately become the full Polygon
    await page.getByRole("button", { name: /Fade-in/i }).click();
    await page.waitForTimeout(50);
    const fadeData = await getStrokeSourceData();
    expect(fadeData.features[0].geometry.type).toBe("Polygon");
    expect(fadeData.features[0].geometry.coordinates).toEqual(TEST_BOUNDARY.features[0].geometry.coordinates);

    // 5. Switch to "Off" while at t=0s, then advance to t=2.5s
    await page.getByRole("button", { name: /Outline/i }).click();
    await setTime(0);
    await page.getByRole("button", { name: /Off/i }).click();
    await setTime(2.5);

    const activeOffData = await getStrokeSourceData();
    expect(activeOffData.features[0].geometry.type).toBe("Polygon");
    expect(activeOffData.features[0].geometry.coordinates).toEqual(TEST_BOUNDARY.features[0].geometry.coordinates);
  });
});
