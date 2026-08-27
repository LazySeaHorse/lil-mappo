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

async function stubExternalServices(page: Page) {
  await page.route("https://api.mapbox.com/styles/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE) }),
  );
  await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://nominatim.openstreetmap.org/search**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_BOUNDARY) }),
  );
}

async function openEditor(page: Page, options: { dismissWalkthrough?: boolean } = {}) {
  await stubExternalServices(page);
  await page.goto("/");
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();

  if (options.dismissWalkthrough !== false) {
    const invitation = page.getByRole("alertdialog", { name: "Want a quick walkthrough?" });
    await expect(invitation).toBeVisible();
    await invitation.getByRole("button", { name: "No thanks" }).click();
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

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("1. app opens without a blank screen or fatal browser errors", async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => fatalErrors.push(error.message));

  await openEditor(page);

  await expect(page.getByAltText("li'l Mappo Logo")).toBeVisible();
  await expect(page.getByTitle("Export")).toBeVisible();
  expect(fatalErrors).toEqual([]);
});

test("2. map and editor load", async ({ page }) => {
  await openEditor(page);

  await expect(page.locator(".mapboxgl-map")).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toHaveCount(1);
  await expect(page.getByText("Camera", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Plan Route")).toBeEnabled();
});

test("2a. quick walkthrough is opt-in and advances through real actions", async ({ page }) => {
  await openEditor(page, { dismissWalkthrough: false });

  const invitation = page.getByRole("alertdialog", { name: "Want a quick walkthrough?" });
  await expect(invitation).toBeVisible();
  await invitation.getByRole("button", { name: "Show me around" }).click();

  await expect(page.getByText("Get comfortable with the map")).toBeVisible();
  await dragMap(page);
  await dragMap(page, "right", { x: 700, y: 320 }, { x: 790, y: 390 });
  await page.mouse.wheel(0, -400);

  await expect(page.getByText("Save this view")).toBeVisible();
  await page.getByTitle("Camera KF").click();

  await expect(page.getByText("Move forward in time")).toBeVisible();
  const timelineRuler = page.getByTestId("timeline-ruler");
  const rulerBounds = await timelineRuler.boundingBox();
  if (!rulerBounds) throw new Error("Timeline ruler has no bounding box");
  await page.mouse.move(rulerBounds.x + 20, rulerBounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(rulerBounds.x + 240, rulerBounds.y + 20, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText("Add another keyframe")).toBeVisible();
  await dragMap(page, "left", { x: 600, y: 330 }, { x: 690, y: 300 });
  await expect(page.getByTitle("Camera KF")).toHaveClass(/animate-pulse/);
  await page.getByTitle("Camera KF").click();

  await expect(page.getByText("Play your camera move")).toBeVisible();
  await expect(page.getByTestId("timeline-ruler-playhead")).toHaveCSS("left", "0px");
  await expect(page.locator('[data-walkthrough="timeline-play"]')).toHaveAttribute("title", "Play / Pause (Space)");
  await page.locator('[data-walkthrough="timeline-play"]').click();
  await expect(page.locator('[data-walkthrough="timeline-play"]')).toHaveClass(/text-primary/);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.locator('[data-walkthrough="timeline-play"]')).not.toHaveClass(/text-primary/);
  await expect(page.getByText("Inspect a keyframe")).toBeVisible();
  await page.locator('[data-walkthrough="timeline-keyframe"]').first().click();
  await expect(page.getByText("Fine-tune this keyframe")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Add a route", { exact: true })).toBeVisible();
  await page.getByTitle("Plan Route").click();
  await expect(page.getByText("Choose travel mode & points")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Highlight a place")).toBeVisible();
  await page.getByTitle("Add Boundary").click();
  await expect(page.getByText("Search regions & nations")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Add a callout", { exact: true })).toBeVisible();
  await page.getByTitle("Add Callout").click();
  await expect(page.getByText("Place a 3D label on the map")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByText("Explore the map in 3D")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Try another map style")).toBeVisible();
  await page.locator('[data-walkthrough="map-style"]').click();
  await page.getByRole("option", { name: "Dark" }).click();
  await expect(page.getByText("Return to Standard")).toBeVisible();
  await page.locator('[data-walkthrough="map-style"]').click();
  await page.getByRole("option", { name: "Standard" }).click();

  await expect(page.getByText("Open Map Settings", { exact: true })).toBeVisible();
  await page.locator('[data-walkthrough="map-settings"]').click();
  await expect(page.getByText("Open the Map tab")).toBeVisible();
  await page.locator('[data-walkthrough="project-settings-map-tab"]').click();
  await expect(page.getByText("Map settings in one place")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Ready to render")).toBeVisible();
  await page.locator('[data-walkthrough="render"]').click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await expect(page.getByText("Walkthrough complete. Your map is ready to build on.")).toBeVisible();
});

test("3. a route can be created and appears in the inspector and timeline", async ({ page }) => {
  await openEditor(page);

  await page.getByTitle("Plan Route").click();
  await page.getByRole("radio", { name: "Flight" }).click();
  await pickMapPoint(page, 0, { x: 620, y: 320 });
  await pickMapPoint(page, 1, { x: 820, y: 420 });
  await page.getByRole("button", { name: "Preview path" }).click();
  await expect(page.getByText("Path validated")).toBeVisible();
  await page.getByRole("button", { name: "Insert route" }).click();

  await expect(page.getByRole("heading", { name: "Route", exact: true })).toBeVisible();
  const routeName = page.locator('input[placeholder="Route name"]');
  await expect(routeName).toHaveValue(/.+ to .+/);
  await expect(page.getByText(await routeName.inputValue(), { exact: true })).toBeVisible();
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
  await titleInput.fill("Customer HQ Updated");
  await expect(page.getByLabel("Map marker").getByText("Customer HQ Updated", { exact: true })).toBeVisible();
});

test("5. a boundary can be added and edited", async ({ page }) => {
  await openEditor(page);

  await page.getByTitle("Add Boundary").click();
  const search = page.getByPlaceholder("Search for a place or region");
  await search.fill("Testland");
  await search.press("Enter");
  await page.getByRole("button", { name: /Testland/ }).click();
  await page.getByRole("button", { name: "Insert boundary" }).click();

  await expect(page.getByRole("heading", { name: "Boundary", exact: true })).toBeVisible();
  const nameInput = page.locator('input[placeholder="Boundary name"]');
  await expect(nameInput).toHaveValue("Testland");
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
  await expect(exportDialog.getByRole("button", { name: /Cloud render.*Not available yet/ })).toBeDisabled();

  await exportDialog.getByRole("button", { name: /Use a paid plan/ }).click();
  const upgradeDialog = page.getByRole("dialog", { name: "Upgrade to Wanderer" });
  await expect(upgradeDialog).toBeVisible();
  await expect(upgradeDialog.getByRole("button", { name: "Subscribe to Wanderer" })).toBeVisible();
});

test("8. main modals open and close without trapping the UI", async ({ page }) => {
  await openEditor(page);

  const exportButton = page.getByTitle("Export");
  await exportButton.click();
  await expect(page.getByRole("dialog", { name: "Export" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Export" })).not.toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "New Project" }).click();
  await expect(page.getByRole("dialog", { name: "New project" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New project" })).not.toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).not.toBeVisible();

  await openMenu(page);
  await page.getByRole("menuitem", { name: "Sign In" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Sign in" })).not.toBeVisible();
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
