import { expect, test, type Page } from "@playwright/test";

const TEST_STYLE = {
  version: 8,
  name: "E2E Chaos Style",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#dbeafe" },
    },
  ],
};

const DEFAULT_BOUNDARY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { display_name: "Testland, Chaos Region", type: "country" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
      },
    },
  ],
};

const ROUTE_A_COORDINATES: [number, number][] = [
  [-10, 10],
  [-10.5, 10.5],
  [-11, 11],
];

const ROUTE_A_RESPONSE = {
  code: "Ok",
  routes: [
    {
      geometry: {
        type: "LineString",
        coordinates: ROUTE_A_COORDINATES,
      },
      duration: 1200,
      distance: 60000,
    },
  ],
};

const ROUTE_B_COORDINATES: [number, number][] = [
  [20, 20],
  [20.5, 20.5],
  [21, 21],
];

const ROUTE_B_RESPONSE = {
  code: "Ok",
  routes: [
    {
      geometry: {
        type: "LineString",
        coordinates: ROUTE_B_COORDINATES,
      },
      duration: 300,
      distance: 15000,
    },
  ],
};

async function stubBaseServices(page: Page) {
  // Styles and telemetry
  await page.route("https://api.mapbox.com/styles/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TEST_STYLE),
    }),
  );
  await page.route("https://events.mapbox.com/**", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  // Default boundary
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DEFAULT_BOUNDARY),
    }),
  );
  // Supabase mock
  await page.route("https://*.supabase.co/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    }),
  );
  // Internal serverless APIs
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"success":true}',
    }),
  );
}

async function openEditor(page: Page) {
  await stubBaseServices(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
    window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
    window.localStorage.setItem("lil-mappo:custom-mapbox-token:v1", "pk.e2e-chaos-token");
    (window as unknown as { __E2E__?: boolean }).__E2E__ = true;
  });

  await page.goto("/");
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
}

async function pickMapPoint(page: Page, pickerIndex = 0, position = { x: 650, y: 350 }) {
  await page.getByTitle("Pick on Map").nth(pickerIndex).click();
  await page.locator(".mapboxgl-canvas").click({ position });
}

test.describe("Network Fault & Async Race Injection Chaos Suite", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("Test 1: Out-of-order route calculation race does not corrupt active route", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    let requestCount = 0;
    let routeAResolved = false;
    let routeBResolved = false;

    // Route A is delayed by 2000ms; Route B resolves quickly in 50ms
    await page.route("https://api.mapbox.com/directions/v5/**", async (route) => {
      requestCount++;
      const currentReq = requestCount;

      if (currentReq === 1) {
        // Route A: 2000ms delay
        await new Promise((r) => setTimeout(r, 2000));
        routeAResolved = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ROUTE_A_RESPONSE),
        });
      } else {
        // Route B: 50ms delay
        await new Promise((r) => setTimeout(r, 50));
        routeBResolved = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ROUTE_B_RESPONSE),
        });
      }
    });

    await openEditor(page);

    // Open Route Planning dropdown
    await page.getByTitle("Plan Route").click();
    await expect(page.getByText("Choose travel mode & points")).toBeVisible();

    // 1. Set points for Route A
    await pickMapPoint(page, 0, { x: 580, y: 300 });
    await pickMapPoint(page, 1, { x: 640, y: 320 });

    // Trigger Route A preview calculation (delayed by 2000ms)
    await page.getByRole("button", { name: "Preview path" }).click();
    expect(requestCount).toBe(1);

    // 2. Immediately switch to Walk for Route B and request preview (resolves in 50ms)
    await page.getByRole("radio", { name: "Walk" }).click();
    await page.getByRole("button", { name: "Preview path" }).click();
    expect(requestCount).toBe(2);

    // 3. Route B should resolve in ~50ms
    await expect(page.getByText("Path validated")).toBeVisible({ timeout: 5000 });
    expect(routeBResolved).toBe(true);

    // Verify previewRoute in store matches Route B geometry
    const previewGeometryB = await page.evaluate(() => {
      const store = (window as any).__projectStore?.getState();
      return store?.previewRoute?.features[0]?.geometry?.coordinates;
    });
    expect(previewGeometryB).toEqual(ROUTE_B_COORDINATES);

    // 4. Wait for Route A to resolve at 2000ms
    await page.waitForTimeout(2200);
    expect(routeAResolved).toBe(true);

    // 5. Assert that Route A's delayed resolution did NOT overwrite Route B
    const previewGeometryAfterA = await page.evaluate(() => {
      const store = (window as any).__projectStore?.getState();
      return store?.previewRoute?.features[0]?.geometry?.coordinates;
    });
    expect(previewGeometryAfterA).toEqual(ROUTE_B_COORDINATES);

    // 6. Assert "Insert route" button remains enabled and inserts Route B into timeline
    await page.getByRole("button", { name: "Insert route" }).click();
    await expect(page.getByRole("heading", { name: "Route", exact: true })).toBeVisible();

    const insertedRoute = await page.evaluate(() => {
      const store = (window as any).__projectStore?.getState();
      const id = store?.selectedItemId;
      return id ? store?.items[id] : null;
    });
    expect(insertedRoute).not.toBeNull();
    expect(insertedRoute?.geojson?.features[0]?.geometry?.coordinates).toEqual(ROUTE_B_COORDINATES);

    expect(pageErrors).toEqual([]);
  });

  test("Test 2: HTTP 429 Rate Limit and HTTP 500 Error recovery", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await openEditor(page);

    // --- Subtest A: HTTP 429 Rate Limit on Mapbox Directions ---
    await page.route("https://api.mapbox.com/directions/v5/**", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ message: "Rate limit exceeded" }),
      }),
    );

    await page.getByTitle("Plan Route").click();
    await expect(page.getByText("Choose travel mode & points")).toBeVisible();

    await pickMapPoint(page, 0, { x: 600, y: 320 });
    await pickMapPoint(page, 1, { x: 700, y: 360 });

    const previewButton = page.getByRole("button", { name: /Preview path/i });
    await previewButton.click();

    // Assert error toast is displayed
    await expect(
      page.locator("[data-sonner-toast]").getByText(/Calculation failed/i),
    ).toBeVisible({ timeout: 5000 });

    // Assert button is restored and actionable rather than stuck in spinner or disabled
    await expect(previewButton).toBeVisible();
    await expect(previewButton).toBeEnabled();
    await expect(previewButton.locator(".animate-spin")).toHaveCount(0);

    // Close Route dialog
    await page.keyboard.press("Escape");
    await expect(page.getByText("Choose travel mode & points")).not.toBeVisible();

    // --- Subtest B: HTTP 500 Internal Server Error on Boundary Search ---
    await page.route("https://nominatim.openstreetmap.org/**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      }),
    );

    await page.getByTitle("Add Boundary").click();
    await expect(page.getByText("Search regions & nations")).toBeVisible();

    const searchInput = page.getByPlaceholder("Search for a place or region");
    await searchInput.fill("FailingZone");
    await searchInput.press("Enter");

    // Assert error toast is displayed
    await expect(
      page.locator("[data-sonner-toast]").getByText(/Cannot search boundaries/i),
    ).toBeVisible({ timeout: 5000 });

    // Assert search button is restored and actionable rather than stuck
    const searchButton = page.locator("button:has(svg.lucide-search)");
    await expect(searchButton).toBeEnabled();
    await expect(searchButton.locator(".animate-spin")).toHaveCount(0);

    // Close Boundary dialog
    await page.keyboard.press("Escape");
    await expect(page.getByText("Search regions & nations")).not.toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("Test 3: Rapid-fire search input debouncing & aborted requests", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const dispatchedQueries: string[] = [];
    const TOKYO_BOUNDARY = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { display_name: "Tokyo, Japan", type: "city" },
          geometry: {
            type: "Polygon",
            coordinates: [[[139.6, 35.6], [139.8, 35.6], [139.8, 35.8], [139.6, 35.8], [139.6, 35.6]]],
          },
        },
      ],
    };

    // Track unhandled promise rejections on window
    await page.addInitScript(() => {
      (window as any).__unhandledRejections = [];
      window.addEventListener("unhandledrejection", (event) => {
        (window as any).__unhandledRejections.push(
          event.reason?.message || String(event.reason),
        );
      });
    });

    await openEditor(page);

    await page.route("https://nominatim.openstreetmap.org/search**", async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("q") || "";
      dispatchedQueries.push(query);

      if (query.includes("Tokyo")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(TOKYO_BOUNDARY),
        });
      } else {
        // Abort earlier rapidly typed requests
        await route.abort("aborted");
      }
    });

    await page.getByTitle("Add Boundary").click();
    await expect(page.getByText("Search regions & nations")).toBeVisible();

    const searchInput = page.getByPlaceholder("Search for a place or region");

    // Rapidly type multiple queries with aborted prior requests
    await searchInput.fill("Paris");
    await searchInput.press("Enter");

    await searchInput.fill("Berlin");
    await searchInput.press("Enter");

    await searchInput.fill("Tokyo");
    await searchInput.press("Enter");

    // Only Tokyo result should be rendered
    await expect(page.getByRole("button", { name: /Tokyo/ })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Paris/ })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Berlin/ })).not.toBeVisible();

    // Verify unhandled rejections are clean
    const clientRejections = await page.evaluate(
      () => (window as any).__unhandledRejections || [],
    );
    expect(clientRejections).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("Test 4: Offline / network dropped recovery", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await openEditor(page);

    // Abort all external network calls to simulate sudden network failure / offline mode
    await page.route("https://api.mapbox.com/directions/v5/**", (route) => route.abort("failed"));
    await page.route("https://nominatim.openstreetmap.org/**", (route) => route.abort("failed"));

    // 1. Route Planning under network drop
    await page.getByTitle("Plan Route").click();
    await expect(page.getByText("Choose travel mode & points")).toBeVisible();

    await pickMapPoint(page, 0, { x: 550, y: 320 });
    await pickMapPoint(page, 1, { x: 650, y: 360 });

    const previewButton = page.getByRole("button", { name: /Preview path/i });
    await previewButton.click();

    // Displays graceful fallback notification
    await expect(
      page.locator("[data-sonner-toast]").getByText(/Calculation failed/i),
    ).toBeVisible({ timeout: 5000 });

    // Actionable button is restored, user is not locked in a spinner
    await expect(previewButton).toBeEnabled();
    await expect(previewButton.locator(".animate-spin")).toHaveCount(0);

    // User cancellation via Escape closes the panel
    await page.keyboard.press("Escape");
    await expect(page.getByText("Choose travel mode & points")).not.toBeVisible();

    // 2. Boundary Search under network drop
    await page.getByTitle("Add Boundary").click();
    await expect(page.getByText("Search regions & nations")).toBeVisible();

    const searchInput = page.getByPlaceholder("Search for a place or region");
    await searchInput.fill("OfflinePlace");
    await searchInput.press("Enter");

    // Displays graceful fallback notification
    await expect(
      page.locator("[data-sonner-toast]").getByText(/Cannot search boundaries/i),
    ).toBeVisible({ timeout: 5000 });

    // Search button is restored
    const searchButton = page.locator("button:has(svg.lucide-search)");
    await expect(searchButton).toBeEnabled();
    await expect(searchButton.locator(".animate-spin")).toHaveCount(0);

    // User cancellation via Escape closes the panel
    await page.keyboard.press("Escape");
    await expect(page.getByText("Search regions & nations")).not.toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
