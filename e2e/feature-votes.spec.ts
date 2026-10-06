import { expect, test, type Page } from "@playwright/test";
import { seedSignedInSession } from "./support/supabaseSession";

const TEST_STYLE = {
  version: 8,
  name: "E2E test style",
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#dbeafe" } }],
};

async function openExport(page: Page) {
  await page.route("https://api.mapbox.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("https://api.mapbox.com/styles/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TEST_STYLE) }),
  );
  await page.route("https://events.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.addInitScript(() => {
    window.localStorage.setItem("lil-mappo:quick-walkthrough:v1", "completed");
    window.localStorage.setItem("lil-mappo:mobile-warning:v1", "dismissed");
  });
  await page.goto("/");
  await expect(page.getByText("Timeline", { exact: true })).toBeVisible();
  await page.getByTitle("Export").click();
  const exportDialog = page.getByRole("dialog", { name: "Export" });
  await expect(exportDialog).toBeVisible();
  return exportDialog;
}

test("signed out: the Cloud render pill previews the feature and sends voters to sign-in", async ({ page }) => {
  const exportDialog = await openExport(page);

  await exportDialog.getByRole("button", { name: "I'd like this" }).click();
  const featureDialog = page.getByRole("dialog", { name: "Cloud render" });
  await expect(featureDialog).toBeVisible();
  await expect(featureDialog.getByTestId("feature-skeleton")).toBeVisible();
  await expect(featureDialog.getByText(/people want this/)).toHaveCount(0);

  await featureDialog.getByRole("button", { name: "Sign in to vote" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  await expect(featureDialog).toBeHidden();
});

test("signed in: voting toggles and calls set_feature_vote", async ({ page }) => {
  await seedSignedInSession(page);

  const votes = new Map<string, boolean>();
  const setCalls: Array<{ p_feature_id: string; p_voted: boolean }> = [];
  await page.route("**/rest/v1/rpc/get_feature_vote_summaries", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        ["cloud-render", "example-projects"].map((id) => ({
          feature_id: id,
          tier: votes.get(id) ? "few" : "none",
          most_requested: false,
          has_voted: votes.get(id) ?? false,
        })),
      ),
    }),
  );
  await page.route("**/rest/v1/rpc/set_feature_vote", (route) => {
    const body = route.request().postDataJSON() as { p_feature_id: string; p_voted: boolean };
    setCalls.push(body);
    votes.set(body.p_feature_id, body.p_voted);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body.p_voted) });
  });

  const exportDialog = await openExport(page);
  await exportDialog.getByRole("button", { name: "I'd like this" }).click();
  const featureDialog = page.getByRole("dialog", { name: "Cloud render" });
  await expect(featureDialog.getByText("Be the first to ask for this")).toBeVisible();

  await featureDialog.getByRole("button", { name: "I'd like this" }).click();
  await expect(featureDialog.getByRole("button", { name: "I'd like this" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => setCalls).toEqual([{ p_feature_id: "cloud-render", p_voted: true }]);
  await expect(featureDialog.getByText("A few people want this")).toBeVisible();

  await featureDialog.getByRole("button", { name: "I'd like this" }).click();
  await expect(featureDialog.getByRole("button", { name: "I'd like this" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => setCalls.at(-1)).toEqual({ p_feature_id: "cloud-render", p_voted: false });
});
