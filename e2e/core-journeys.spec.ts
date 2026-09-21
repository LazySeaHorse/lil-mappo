import { expect, test, type Page } from "@playwright/test";

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
        coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
      },
    },
  ],
};

const TEST_DEM = {
  tilejson: "2.2.0",
  name: "terrain-dem",
  minzoom: 0,
  maxzoom: 14,
  tiles: ["https://api.mapbox.com/raster/v1/mapbox.mapbox-terrain-dem-v1/{z}/{x}/{y}.webp"],
};

const TEST_DIRECTIONS = {
  code: "Ok",
  routes: [
    {
      geometry: {
        coordinates: [[-1, -1], [0, 0], [1, 1]],
        type: "LineString",
      },
      duration: 120,
      distance: 250000,
    },
  ],
};

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function stubExternalServices(page: Page) {
  // Wildcard fallback for any unhandled Mapbox endpoints (telemetry, fonts, etc.)
  await page.route("https://api.mapbox.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("https://api.mapbox.com/raster/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: TRANSPARENT_PNG }),
  );
  await page.route("https://api.mapbox.com/v4/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_DEM) }),
  );
  await page.route("https://api.mapbox.com/directions/v5/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_DIRECTIONS) }),
  );
  await page.route("https://api.mapbox.com/styles/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE) }),
  );
  await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_BOUNDARY) }),
  );
}

async function openEditor(page: Page, options: { dismissWalkthrough?: boolean } = {}) {
  await stubExternalServices(page);
  if (options.dismissWalkthrough !== false) {
    await page.addInitScript(() => {
      window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
      window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
    });
  }
  await page.goto("/");
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
}

async function openMenu(page: Page) {
  await page.getByTitle("Menu").click();
}

async function unlockLocalProjects(page: Page) {
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("pk.eyJ1Ijo...").fill("pk.e2e-test-token");
  await Promise.all([
    page.waitForEvent("load"),
    dialog.getByRole("button", { name: "Save" }).click(),
  ]);
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
}

test.describe("5 Golden E2E Journeys", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  // ---------------------------------------------------------------------------
  // Journey 1: Core Creation & Animation Loop
  // Tests the full creation cycle: Route + Callout + Boundary + Timeline Playback
  // ---------------------------------------------------------------------------
  test("Journey 1: Core Creation & Animation Loop", async ({ page }) => {
    await openEditor(page);

    // 1. Add a Flight Route
    await page.getByTitle("Plan Route").click();
    const routeDropdown = page.getByRole("menu");
    await routeDropdown.getByRole("radio", { name: "Flight" }).click();

    await routeDropdown.getByTitle("Pick on Map").nth(0).click();
    await page.locator(".mapboxgl-canvas").click({ position: { x: 620, y: 320 } });

    await routeDropdown.getByTitle("Pick on Map").nth(1).click();
    await page.locator(".mapboxgl-canvas").click({ position: { x: 820, y: 420 } });

    await routeDropdown.getByRole("button", { name: "Preview path" }).click();
    await expect(page.getByText("Path validated")).toBeVisible();
    await routeDropdown.getByRole("button", { name: "Insert route" }).click();

    // Verify route was inserted and inspector is active
    await expect(page.getByRole("heading", { name: "Route", exact: true })).toBeVisible();
    const routeInput = page.locator('input[placeholder="Route name"]');
    await expect(routeInput).toHaveValue(/.+ (to|→) .+/);
    const createdRouteName = await routeInput.inputValue();

    // 2. Add a 3D Callout
    await page.getByTitle("Add Callout").click();
    const calloutDropdown = page.getByRole("menu");
    await calloutDropdown.getByTitle("Pick on Map").click();
    await page.locator(".mapboxgl-canvas").click({ position: { x: 740, y: 350 } });

    const calloutTitle = "Alpha Basecamp";
    await calloutDropdown.getByPlaceholder("Callout title").fill(calloutTitle);
    await calloutDropdown.getByRole("button", { name: "Create callout" }).click();

    // Verify callout appears in inspector
    await expect(page.getByRole("heading", { name: "Callout", exact: true })).toBeVisible();

    // 3. Add a Geo Boundary
    await page.getByTitle("Add Boundary").click();
    const boundaryDropdown = page.getByRole("menu");
    const searchInput = boundaryDropdown.getByPlaceholder("Search for a place or region");
    await searchInput.fill("Testland");
    await searchInput.press("Enter");
    await boundaryDropdown.getByRole("button", { name: /Testland/ }).click();
    await boundaryDropdown.getByRole("button", { name: "Insert boundary" }).click();
    await expect(page.getByRole("heading", { name: "Boundary", exact: true })).toBeVisible();

    // 4. Verify all items exist on Timeline
    await expect(page.getByText(createdRouteName, { exact: true })).toBeVisible();
    await expect(page.getByTestId("timeline-viewport-content").getByText(calloutTitle, { exact: true })).toBeVisible();
    await expect(page.getByText("Testland", { exact: true })).toBeVisible();

    // 5. Test Timeline Playback
    const playButton = page.getByTitle("Play / Pause (Space)");
    await expect(playButton).toBeVisible();
    await playButton.click();

    // Wait for playhead to advance
    await page.waitForTimeout(1500);
    await playButton.click(); // pause

    // Verify time display is no longer at 00:00.00
    const timeDisplay = page.locator("#root").getByText(/00:0[1-9]\.[0-9]{2}/);
    await expect(timeDisplay).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Journey 2: Deep Persistence & Project Recovery Loop
  // Verifies that customer projects survive browser reloads and reload from IndexedDB
  // ---------------------------------------------------------------------------
  test("Journey 2: Deep Persistence & Project Recovery Loop", async ({ page }) => {
    await openEditor(page);
    await unlockLocalProjects(page);

    const projectName = "Persistence Smoke Project";

    // 1. Create a new custom named project
    await openMenu(page);
    await page.getByRole("menuitem", { name: "New Project" }).click();
    const newProject = page.getByRole("dialog", { name: "New project" });
    await newProject.getByLabel("Name").fill(projectName);
    await newProject.getByRole("button", { name: "Create project" }).click();

    // 2. Save project to local library
    await openMenu(page);
    await page.getByRole("menuitem", { name: "Save to Library" }).click();
    await expect(page.getByText("Saved to library")).toBeVisible();

    // 3. Hard browser reload
    await page.reload();
    await expect(page.getByText("Timeline", { exact: true })).toBeVisible();

    // 4. Open library and reload the project
    await openMenu(page);
    await page.getByRole("menuitem", { name: "Projects" }).click();
    const library = page.getByRole("dialog", { name: "Projects" });
    await expect(library.getByText(projectName, { exact: true })).toBeVisible();

    await library.getByRole("button", { name: "Load" }).click();
    await expect(page.getByText(`Loaded: ${projectName}`)).toBeVisible();
    await expect(library).not.toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Journey 3: Monetization, Gating & Export Guardrails Loop
  // Verifies free-tier caps, cloud render lockdown, and upgrade modal trigger
  // ---------------------------------------------------------------------------
  test("Journey 3: Monetization, Gating & Export Guardrails Loop", async ({ page }) => {
    await openEditor(page);

    // 1. Open Export Modal
    await page.getByTitle("Export").click();
    const exportDialog = page.getByRole("dialog", { name: "Export" });
    await expect(exportDialog).toBeVisible();

    // 2. Verify Free Plan constraints are enforced in UI
    await expect(exportDialog.getByText(/Free plan limit:.*720p, 30 FPS, and 30 seconds/)).toBeVisible();
    await expect(exportDialog.getByRole("button", { name: /Cloud render.*Not available yet/ })).toBeDisabled();

    // 3. Click Upgrade trigger
    await exportDialog.getByRole("button", { name: /Use a paid plan/ }).click();
    const upgradeDialog = page.getByRole("dialog", { name: "Upgrade to Wanderer" });
    await expect(upgradeDialog).toBeVisible();
    await expect(upgradeDialog.getByRole("button", { name: "Subscribe to Wanderer" })).toBeVisible();

    // 4. Close dialogs cleanly
    await page.keyboard.press("Escape");
    await expect(upgradeDialog).not.toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // Journey 4: Modal Trap, Keyboard & Responsive Layout Loop
  // Verifies no overlay trapping on desktop and full functionality on mobile
  // ---------------------------------------------------------------------------
  test("Journey 4: Modal Trap, Keyboard & Responsive Layout Loop", async ({ page }) => {
    await openEditor(page);

    // 1. Desktop Escape & Close verification for primary modals
    const dialogTriggers = [
      { button: page.getByTitle("Export"), title: "Export" },
      { menuAction: "Settings", title: "Settings" },
      { menuAction: "New Project", title: "New project" },
    ];

    for (const item of dialogTriggers) {
      if (item.button) {
        await item.button.click();
      } else if (item.menuAction) {
        await openMenu(page);
        await page.getByRole("menuitem", { name: item.menuAction, exact: true }).click();
      }
      const dialog = page.getByRole("dialog", { name: item.title });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      if (await dialog.isVisible()) {
        await dialog.getByRole("button", { name: "Close" }).click();
      }
      await expect(dialog).not.toBeVisible();
      // Ensure overlay is unmounted so pointer events are unlocked
      await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
    }

    // 2. Mobile Viewport Mode-Switching Check
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    // Mobile bottom toolbar should have Add (+) and Layers modes
    const addModeButton = page.getByTitle("Add New Track");
    await expect(addModeButton).toBeVisible();
    await addModeButton.click();

    await expect(page.getByTitle("Plan Route")).toBeVisible();
    await expect(page.getByTitle("Add Callout")).toBeVisible();

    // Toggle back to default
    await page.locator(".bg-secondary\\/50").click();

    // Toggle layers mode
    const layersButton = page.getByTitle("Map Display");
    await expect(layersButton).toBeVisible();
    await layersButton.click();

    // Reset viewport back to desktop
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  // ---------------------------------------------------------------------------
  // Journey 5: Zero Silent Errors & Anti-Hallucination Trap
  // Strict assertion: 0 uncaught exceptions or console errors during deep interaction
  // ---------------------------------------------------------------------------
  test("Journey 5: Zero Silent Errors & Anti-Hallucination Trap", async ({ page }) => {
    const recordedErrors: string[] = [];

    page.on("pageerror", (err) => {
      recordedErrors.push(`[PageError] ${err.message}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore benign third-party or browser telemetry notices
        if (text.includes("caniuse-lite") || text.includes("favicon.ico") || text.includes("browserslist")) {
          return;
        }
        recordedErrors.push(`[ConsoleError] ${text}`);
      }
    });

    await openEditor(page);

    // Interact across several UI surfaces
    await openMenu(page);
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(settingsDialog).toBeVisible();
    await page.keyboard.press("Escape");
    if (await settingsDialog.isVisible()) {
      await settingsDialog.getByRole("button", { name: "Close" }).click();
    }
    await expect(settingsDialog).not.toBeVisible();

    // Toggle Map Style: Standard -> Dark -> Standard
    const styleCombobox = page.locator('[data-walkthrough="map-style"]');
    if (await styleCombobox.isVisible()) {
      await styleCombobox.click();
      await page.getByRole("option", { name: "Dark" }).click();
      await page.waitForTimeout(300);
      await styleCombobox.click();
      await page.getByRole("option", { name: "Standard" }).click();
    }

    // Toggle 3D Terrain
    const terrainButton = page.getByRole("button", { name: "Terrain" });
    if (await terrainButton.isVisible()) {
      await terrainButton.click();
      await page.waitForTimeout(200);
      await terrainButton.click();
    }

    // Verify exactly 0 fatal or unhandled errors occurred
    expect(recordedErrors, `Expected 0 silent errors, but found: ${recordedErrors.join("\n")}`).toEqual([]);
  });
});
