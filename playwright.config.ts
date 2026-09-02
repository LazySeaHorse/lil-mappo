import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

function sharedChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }

  // Hosted workspaces can provide Playwright browser bundles in shared caches.
  // Derive the required revision from Playwright so dependency updates cannot
  // silently select an incompatible shared Chromium build.
  const revisionDirectory = chromium.executablePath()
    .split(path.sep)
    .find((part) => /^chromium-\d+$/.test(part));
  if (!revisionDirectory) return undefined;

  const requiredRevision = Number(revisionDirectory.slice("chromium-".length));
  const roots = process.env.PLAYWRIGHT_SHARED_BROWSERS_PATH
    ? [process.env.PLAYWRIGHT_SHARED_BROWSERS_PATH]
    : [path.join(homedir(), ".cache", "ms-playwright"), "/tmp/lilmappo-playwright"];

  const candidates = roots.flatMap((root) => {
    let directories: string[] = [];
    try {
      directories = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
        .map((entry) => entry.name);
    } catch {
      return [];
    }

    return directories.flatMap((directory) => {
      const revision = Number(directory.slice("chromium-".length));
      return ["chrome-linux", "chrome-linux64"].flatMap((platformDirectory) => {
        const bundle = path.join(root, directory, platformDirectory);
        const executable = path.join(bundle, "chrome");
        // A copied executable without its ICU data exists in some workspaces but
        // crashes before launch, so only select complete browser bundles.
        return existsSync(executable) && existsSync(path.join(bundle, "icudtl.dat"))
          ? [{ executable, revision }]
          : [];
      });
    });
  });

  candidates.sort((left, right) =>
    Math.abs(left.revision - requiredRevision) - Math.abs(right.revision - requiredRevision),
  );
  return candidates[0]?.executable;
}

const chromiumExecutable = sharedChromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
        launchOptions: chromiumExecutable
          ? { executablePath: chromiumExecutable }
          : undefined,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
