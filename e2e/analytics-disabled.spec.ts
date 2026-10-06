import { expect, test, type Page } from "@playwright/test";

/**
 * Analytics must stay silent under Playwright: the dev server is not a
 * production build, has no VITE_POSTHOG_KEY, runs on an unlisted host and the
 * browser is automated, so any of those alone keeps PostHog off. This guards
 * against a regression in the gate (including the anonymous guest counters,
 * which bypass the SDK and use a plain fetch to /_m).
 */

const TEST_STYLE = {
  version: 8,
  name: "E2E test style",
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#dbeafe" } }],
};

async function stubMapbox(page: Page) {
  await page.route("https://api.mapbox.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("https://api.mapbox.com/styles/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE) }),
  );
  await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
}

const isAnalyticsRequest = (url: string) => {
  const { pathname, hostname } = new URL(url);
  return pathname === "/_m" || pathname.startsWith("/_m/") || /posthog/i.test(hostname) || /posthog/i.test(pathname);
};

test("sends no analytics traffic during a guest smoke flow", async ({ page }) => {
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (isAnalyticsRequest(request.url())) analyticsRequests.push(`${request.method()} ${request.url()}`);
  });

  await stubMapbox(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
    window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
  });
  // Attribution params must not be consumed (or stripped) while analytics is off.
  await page.goto("/?utm_source=e2e");
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("utm_source")).toBe("e2e");

  // Hit a sign-in gate, which would normally fire the anonymous guest_gate_hit counter.
  await page.getByTitle("li'l Mappo menu").click();
  await page.getByRole("menuitem", { name: /import project file/i }).click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();

  // Give any stray beacon / keepalive fetch time to leave the page.
  await page.waitForTimeout(1500);

  expect(analyticsRequests).toEqual([]);
  const sdkLoaded = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .some((entry) => /posthog|module\.full\.no-external/i.test(entry.name)),
  );
  expect(sdkLoaded).toBe(false);
});
