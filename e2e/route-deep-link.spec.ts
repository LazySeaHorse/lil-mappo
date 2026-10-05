import { expect, test, type Page } from "@playwright/test";

const TEST_STYLE = {
  version: 8,
  name: "E2E test style",
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#dbeafe" } }],
};

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function stubExternalServices(page: Page) {
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
}

async function openPath(page: Page, path: string) {
  await stubExternalServices(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
    window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
  });
  await page.goto(path);
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("deep link opens a flight route between the two airports and drops the URL", async ({ page }) => {
  const fatalErrors: string[] = [];
  page.on("pageerror", (error) => fatalErrors.push(error.message));

  await openPath(page, "/routes/JFK-to-lhr?autocam=drone&utm_source=seo");

  await expect(page.getByText("Opened JFK to LHR")).toBeVisible();
  await expect(page.getByText(/Kennedy.*Heathrow/).first()).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
  expect(fatalErrors).toEqual([]);
});

test("an unknown airport code toasts and falls back to the empty editor", async ({ page }) => {
  await openPath(page, "/routes/zzz-to-lhr");

  await expect(page.getByText(/Couldn't find airport ZZZ/)).toBeVisible();
  await expect(page.getByText(/Heathrow/)).toHaveCount(0);
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
});

test("a deep link gets past the guest map-load cap that blocks a normal visit", async ({ context }) => {
  test.slow();
  // Each new page is a new browser session; they share localStorage, where the guest counter lives.
  for (let i = 0; i < 3; i += 1) {
    const page = await context.newPage();
    await openPath(page, "/");
    await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
    // The guest load is counted when the map reports ready, slightly after the canvas appears.
    await page.waitForTimeout(3000);
    await page.close();
  }

  const blocked = await context.newPage();
  await stubExternalServices(blocked);
  await blocked.goto("/");
  await expect(blocked.getByText("Sign in to continue")).toBeVisible();
  await blocked.close();

  const deepLinked = await context.newPage();
  await openPath(deepLinked, "/routes/jfk-to-lhr");
  await expect(deepLinked.locator(".mapboxgl-canvas")).toBeVisible();
  await expect(deepLinked.getByText("Sign in to continue")).toHaveCount(0);
});
