import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

const SEARCH_PLACES: Record<string, { id: string; name: string; coordinates: [number, number] }> = {
  "Times Square": { id: "times-square", name: "Times Square", coordinates: [-73.9855, 40.758] },
  "Central Park": { id: "central-park", name: "Central Park", coordinates: [-73.9654, 40.7829] },
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
  await page.route("https://api.mapbox.com/search/searchbox/v1/suggest*", (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    const place = SEARCH_PLACES[query];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        suggestions: place
          ? [{ name: place.name, mapbox_id: place.id, feature_type: "poi", place_formatted: "New York, United States" }]
          : [],
      }),
    });
  });
  await page.route("https://api.mapbox.com/search/searchbox/v1/retrieve/**", (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    const place = Object.values(SEARCH_PLACES).find((p) => p.id === id);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: place
          ? [{ type: "Feature", geometry: { type: "Point", coordinates: place.coordinates }, properties: { name: place.name, mapbox_id: place.id } }]
          : [],
      }),
    });
  });
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

  if (options.dismissWalkthrough === false) {
    const invitation = page.getByRole("alertdialog", { name: "Make your first trip video" });
    await expect(invitation).toBeVisible();
  }
}

async function dragMap(
  page: Page,
  button: "left" | "right" = "left",
  from = { x: 620, y: 300 },
  to = { x: 720, y: 360 },
) {
  const canvas = page.locator(".mapboxgl-canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Map canvas has no bounding box");

  await page.mouse.move(bounds.x + from.x, bounds.y + from.y);
  await page.mouse.down({ button });
  await page.mouse.move(bounds.x + to.x, bounds.y + to.y, { steps: 8 });
  await page.mouse.up({ button });
}

async function pickMapPoint(page: Page, pickerIndex = 0, position = { x: 720, y: 350 }) {
  await page.getByTitle("Pick on Map").nth(pickerIndex).click();
  await page.locator(".mapboxgl-canvas").click({ position });
}

/** Inspector content must fit the panel: long text truncates instead of widening it and getting cut off. */
async function expectInspectorFitsWidth(page: Page) {
  const viewport = page.locator('[data-walkthrough="inspector-panel"] [data-slot="scroll-area-viewport"]');
  await expect.poll(() => viewport.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

async function openMenu(page: Page) {
  await page.getByTitle("li'l Mappo menu").click();
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

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("1. app opens without a blank screen or fatal browser errors", async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => fatalErrors.push(error.message));

  await openEditor(page);

  await expect(page.getByTitle("li'l Mappo menu")).toBeVisible();
  await expect(page.getByTitle("Export")).toBeVisible();
  expect(fatalErrors).toEqual([]);
});

test("2. map and editor load", async ({ page }) => {
  await openEditor(page);

  await expect(page.locator(".mapboxgl-map")).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toHaveCount(1);
  await expect(page.getByText("Camera views", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Plan Route")).toBeEnabled();
});

test("2a. quick walkthrough makes a first trip video through real actions", async ({ page }) => {
  test.slow();
  await openEditor(page, { dismissWalkthrough: false });

  const invitation = page.getByRole("alertdialog", { name: "Make your first trip video" });
  await expect(invitation).toBeVisible();
  await expect(invitation.getByText(/about 3 minutes/)).toBeVisible();
  await invitation.getByRole("button", { name: "Start tour" }).click();

  await expect(page.getByText("Learn the map controls")).toBeVisible();
  await dragMap(page);
  await dragMap(page, "right", { x: 700, y: 320 }, { x: 790, y: 390 });
  await page.mouse.wheel(0, -400);

  await expect(page.getByText("Open Plan Route", { exact: true })).toBeVisible();
  await page.getByTitle("Plan Route").click();

  await expect(page.getByText("Pick a start and an end place")).toBeVisible();
  for (const [placeholder, place] of [["Start location...", "Times Square"], ["End location...", "Central Park"]]) {
    const field = page.getByPlaceholder(placeholder);
    await field.fill(place);
    await field.press("Enter");
    await page.getByRole("button", { name: new RegExp(place) }).click();
    await expect(field).toHaveValue(place);
  }

  await expect(page.getByText("Preview the path")).toBeVisible();
  await page.getByRole("button", { name: "Preview path" }).click();

  await expect(page.getByText("Add the route to your video")).toBeVisible();
  await page.getByRole("button", { name: "Insert route" }).click();

  await expect(page.getByText("Make the camera follow the route")).toBeVisible();
  // The route inspector shows the planner at once, with the place names, not coordinates.
  await expect(page.getByRole("region", { name: "Path" }).getByPlaceholder("Search address or coordinates").first()).toHaveValue("Times Square");
  await page.locator('[data-walkthrough="follow-route"]').getByRole("switch").click();

  await expect(page.getByText("Play your trip")).toBeVisible();
  await expect(page.getByTestId("timeline-ruler-playhead")).toHaveCSS("left", "0px");
  await page.locator('[data-walkthrough="timeline-play"]').click();
  await expect(page.locator('[data-walkthrough="timeline-play"]')).toHaveClass(/text-primary/);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator('[data-walkthrough="timeline-play"]')).not.toHaveClass(/text-primary/);

  await expect(page.getByText("More things you can add")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Export your video", { exact: true })).toBeVisible();
  await page.locator('[data-walkthrough="render"]').click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await expect(page.getByText("Tour complete. Press Export when your trip video is ready.")).toBeVisible();
});

test("3. a route can be created and appears in the inspector and timeline", async ({ page }) => {
  await openEditor(page);

  await page.getByTitle("Plan Route").click();
  await page.getByRole("radio", { name: "Flight" }).click();
  await pickMapPoint(page, 0, { x: 620, y: 320 });
  await pickMapPoint(page, 1, { x: 820, y: 420 });
  await page.getByRole("button", { name: "Preview path" }).click();
  await expect(page.getByText("Route calculated")).toBeVisible();
  await page.getByRole("button", { name: "Insert route" }).click();

  await expect(page.getByRole("heading", { name: "Route", exact: true })).toBeVisible();
  const routeName = page.locator('input[placeholder="Route name"]');
  await expect(routeName).toHaveValue(/.+ (to|→) .+/);
  await expect(page.getByText(await routeName.inputValue(), { exact: true })).toBeVisible();
  await expectInspectorFitsWidth(page);
});

test("4. a callout can be added and edited", async ({ page }) => {
  await openEditor(page);

  await page.getByTitle("Add Callout").click();
  await pickMapPoint(page, 0, { x: 760, y: 360 });
  await page.getByPlaceholder("Callout title").fill("Customer HQ");
  await page.getByRole("button", { name: "Create callout" }).click();

  await expect(page.getByRole("heading", { name: "Callout", exact: true })).toBeVisible();
  const titleInput = page.locator("#root").getByRole("textbox", { name: "Callout title" });
  await expect(titleInput).toHaveValue("Customer HQ");
  await expectInspectorFitsWidth(page);
  await titleInput.fill("Customer HQ Updated");
  // Callouts draw on one overlay canvas next to the map canvas, so there is no text to find: check it holds pixels.
  await expect.poll(() => page.evaluate(() => {
    const overlay = [...document.querySelectorAll<HTMLCanvasElement>(".mapboxgl-canvas-container canvas")]
      .find((canvas) => !canvas.classList.contains("mapboxgl-canvas"));
    const pixels = overlay?.getContext("2d")?.getImageData(0, 0, overlay.width, overlay.height).data;
    return pixels ? pixels.some((value, index) => index % 4 === 3 && value > 0) : false;
  })).toBe(true);
});

test("5. a boundary can be added and edited", async ({ page }) => {
  await openEditor(page);

  await page.getByTitle("Add Boundary").click();
  const search = page.getByPlaceholder("Search for a place or region");
  await search.fill("Testland");
  await search.press("Enter");
  await page.getByRole("button", { name: /Testland/ }).click();
  await page.getByRole("button", { name: "Insert boundary" }).click();

  await expect(page.getByRole("heading", { name: "Area", exact: true })).toBeVisible();
  const nameInput = page.locator('input[placeholder="Boundary name"]');
  await expect(nameInput).toHaveValue("Testland");
  await expectInspectorFitsWidth(page);
  await nameInput.fill("Testland Updated");
  await expect(page.getByText("Testland Updated", { exact: true })).toBeVisible();
});

test("6. a project can be saved, reloaded, and reopened", async ({ page }) => {
  await openEditor(page);
  await unlockLocalProjects(page);

  await openMenu(page);
  await page.getByRole("menuitem", { name: "New Project" }).click();
  const newProject = page.getByRole("dialog", { name: "New project" });
  await newProject.getByLabel("Name").fill("Persistence Smoke Project");
  await newProject.getByRole("button", { name: "Create project" }).click();
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Save to Library" }).click();
  await expect(page.getByText("Saved to library")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
  await openMenu(page);
  await page.getByRole("menuitem", { name: "Projects" }).click();
  const library = page.getByRole("dialog", { name: "Projects" });
  await expect(library.getByText("Persistence Smoke Project", { exact: true })).toBeVisible();
  await library.getByRole("button", { name: "Load" }).click();
  await expect(page.getByText("Loaded: Persistence Smoke Project")).toBeVisible();
  await expect(library).not.toBeVisible();
});

test("7. export reaches the correct free-plan and upgrade state", async ({ page }) => {
  await openEditor(page);

  await page.getByTitle("Export").click();
  const exportDialog = page.getByRole("dialog", { name: "Export" });
  await expect(exportDialog).toBeVisible();
  await expect(exportDialog.getByText(/Free plan limit:.*720p, 30 FPS, and 30 seconds/)).toBeVisible();
  await expect(exportDialog.getByRole("button", { name: "Cloud render, not built yet" })).toBeEnabled();

  await exportDialog.getByRole("button", { name: /Use a paid plan/ }).click();
  const upgradeDialog = page.getByRole("dialog", { name: "Upgrade to Wanderer" });
  await expect(upgradeDialog).toBeVisible();
  await expect(upgradeDialog.getByRole("button", { name: "Subscribe to Wanderer" })).toBeVisible();
});

test("8. main modals open and close without trapping the UI", async ({ page }) => {
  await openEditor(page);

  const exportButton = page.getByTitle("Export");
  await exportButton.click();
  const exportDialog = page.getByRole("dialog", { name: "Export" });
  await expect(exportDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(exportDialog).not.toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "New Project" }).click();
  const newProjectDialog = page.getByRole("dialog", { name: "New project" });
  await expect(newProjectDialog).toBeVisible();
  await expect(newProjectDialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(newProjectDialog).not.toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible();
  await expect(settingsDialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(settingsDialog).not.toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Sign In" }).click();
  const signInDialog = page.getByRole("dialog", { name: "Sign in" });
  await expect(signInDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(signInDialog).not.toBeVisible();
});

test("9. local export produces an MP4 download", async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);

  const supportsWebCodecs = await page.evaluate(() => typeof VideoEncoder !== "undefined");
  test.skip(!supportsWebCodecs, "The test browser does not provide WebCodecs");

  await unlockLocalProjects(page);
  await page.getByTitle("Export").click();

  const exportDialog = page.getByRole("dialog", { name: "Export" });
  await expect(exportDialog).toBeVisible();
  await exportDialog.locator('input[type="number"]').nth(1).fill("0.1");

  const exportButton = exportDialog.getByRole("button", { name: "Export locally" });
  await expect(exportButton).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();

  const file = await readFile(downloadPath!);
  expect(file.byteLength).toBeGreaterThan(1_000);
  expect(file.subarray(4, 8).toString("ascii")).toBe("ftyp");
});
