import type { Page } from "@playwright/test";
import { loadEnv } from "vite";

/**
 * Seeds a fake signed-in Supabase session so the app boots as a signed-in user
 * without talking to a real auth server. supabase-js reads the session from
 * localStorage (`sb-<project-ref>-auth-token`) and only hits the network when the
 * token is about to expire, so a far-future `expires_at` is enough.
 *
 * The caller must stub any REST/RPC endpoints the test cares about; this also
 * installs catch-all stubs so nothing reaches a real backend.
 */
export const E2E_USER_ID = "00000000-0000-4000-8000-000000000001";

function supabaseStorageKey(): string {
  const env = loadEnv("development", process.cwd(), "VITE_");
  const url = env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

export async function seedSignedInSession(page: Page) {
  const key = supabaseStorageKey();
  const session = {
    access_token: "e2e-access-token",
    refresh_token: "e2e-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
    user: {
      id: E2E_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "e2e@example.com",
      email_confirmed_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      app_metadata: { provider: "email" },
      user_metadata: {},
    },
  };

  await page.addInitScript(
    ([storageKey, value]) => window.localStorage.setItem(storageKey, value),
    [key, JSON.stringify(session)] as const,
  );

  // Registered first so more specific stubs added later by the test win.
  await page.route("**/auth/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session.user) }),
  );
  await page.route("**/rest/v1/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route("**/rest/v1/subscriptions*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );
}
