import { expect, test, type Page } from '@playwright/test';
import { SeededRandom } from './fuzz/prng';
import { FlightRecorder } from './fuzz/flightRecorder';
import { validateStoreInvariants, type MinimalProjectState } from './fuzz/storeInvariants';
import { smartMonkeyActions } from './fuzz/smartMonkeyActions';

const TEST_STYLE = {
  version: 8,
  name: 'E2E Fuzz Style',
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#dbeafe' },
    },
  ],
};

const TEST_BOUNDARY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { display_name: 'Testland, Fuzz Region', type: 'country' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
      },
    },
  ],
};

const TEST_DIRECTIONS = {
  code: 'Ok',
  routes: [
    {
      geometry: {
        coordinates: [[-1, -1], [0, 0], [1, 1]],
        type: 'LineString',
      },
      duration: 120,
      distance: 250000,
    },
  ],
};

async function stubExternalServices(page: Page) {
  // 1. Mapbox styles, telemetry, tiles, directions & search (100% mocked, $0 cost)
  await page.route('https://api.mapbox.com/styles/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_STYLE) }),
  );
  await page.route('https://api.mapbox.com/directions/v5/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_DIRECTIONS) }),
  );
  await page.route('https://api.mapbox.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('https://events.mapbox.com/**', (route) => route.fulfill({ status: 204, body: '' }));

  // 2. OpenStreetMap / Nominatim boundary searches
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_BOUNDARY) }),
  );

  // 3. Supabase Auth and Database
  await page.route('https://*.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  // 4. Dodo Payments API and Hosted Checkout
  await page.route('https://*.dodopayments.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"url":"#mock-checkout"}' }),
  );

  // 5. Internal Serverless API routes
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }),
  );
}

test.describe('UI Fuzzing & Monkey Testing Suite (Approach C)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Smart Domain Monkey stresses UI while maintaining store & runtime invariants', async ({ page }) => {
    const fuzzDurationSec = Number(process.env.FUZZ_DURATION_SEC) || 0;
    const fuzzDurationMs = fuzzDurationSec * 1000;
    const totalActions = Number(process.env.FUZZ_ACTIONS) || (fuzzDurationMs > 0 ? Number.MAX_SAFE_INTEGER : 50);
    const seed = Number(process.env.FUZZ_SEED) || Math.floor(Math.random() * 1_000_000);
    const stepDelayMs = Number(process.env.FUZZ_STEP_DELAY_MS) || 50;

    if (fuzzDurationMs > 0) {
      test.setTimeout(fuzzDurationMs + 180_000);
    } else {
      test.setTimeout(Math.max(60_000, totalActions * 3000));
    }

    const rng = new SeededRandom(seed);
    const recorder = new FlightRecorder(50);
    const pageErrors: string[] = [];

    page.on('pageerror', (err) => {
      // Catch fatal JavaScript crashes or React error boundaries
      pageErrors.push(err.message);
    });

    await stubExternalServices(page);

    // Seed localStorage so walkthrough and mobile warnings don't block the editor
    await page.addInitScript(() => {
      window.localStorage.setItem('lil-mappo:quick-walkthrough:v1', 'completed');
      window.localStorage.setItem('lil-mappo:mobile-warning:v1', 'dismissed');
      // Set test API token so Mapbox initialization succeeds cleanly
      window.localStorage.setItem('lil-mappo:custom-mapbox-token:v1', 'pk.e2e-fuzz-token');
      (window as unknown as { __E2E__?: boolean }).__E2E__ = true;
    });

    await page.goto('/');
    await expect(page.getByText('Timeline', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15_000 });

    const weightedOptions = smartMonkeyActions.map((action) => ({
      item: action,
      weight: action.weight,
    }));

    const startTime = Date.now();
    let step = 0;

    // Perform chaos actions
    while (step < totalActions) {
      if (fuzzDurationMs > 0 && Date.now() - startTime >= fuzzDurationMs) {
        break;
      }

      step++;
      const action = rng.weightedPick(weightedOptions);

      try {
        await action.execute(page, rng, recorder);
      } catch (execErr: unknown) {
        // Log individual action exception to flight recorder
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        recorder.record(action.category, `Execution caught: ${action.name}`, { error: msg });
      }

      // 1. Assert no fatal unhandled page errors occurred
      if (pageErrors.length > 0) {
        const trace = recorder.formatTrace(seed, `Fatal page error: ${pageErrors[0]}`);
        console.error(trace);
        throw new Error(trace);
      }

      // Check time limit before delaying
      if (fuzzDurationMs > 0 && Date.now() - startTime >= fuzzDurationMs) {
        break;
      }

      if (stepDelayMs > 0) {
        await page.waitForTimeout(stepDelayMs);
      }

      // 2. Assert Zustand store invariants every 5 actions
      if (step % 5 === 0) {
        const storeState = await page
          .evaluate(() => {
            const store = (window as unknown as { __projectStore?: { getState: () => MinimalProjectState } }).__projectStore;
            return store?.getState();
          })
          .catch(() => null);

        if (storeState) {
          const violations = validateStoreInvariants(storeState);
          if (violations.length > 0) {
            const firstViolation = violations[0].message;
            const trace = recorder.formatTrace(seed, `Store invariant violation: ${firstViolation}`);
            console.error(trace);
            throw new Error(trace);
          }
        }
      }

      // 3. Periodic progress logging
      if (step % 25 === 0) {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        console.log(`[SMART MONKEY] Progress: ${step} actions completed (${elapsedSec}s elapsed)...`);
      }
    }

    // Final invariant check
    const finalStoreState = await page
      .evaluate(() => {
        const store = (window as unknown as { __projectStore?: { getState: () => MinimalProjectState } }).__projectStore;
        return store?.getState();
      })
      .catch(() => null);

    if (finalStoreState) {
      const violations = validateStoreInvariants(finalStoreState);
      if (violations.length > 0) {
        const firstViolation = violations[0].message;
        const trace = recorder.formatTrace(seed, `Store invariant violation on completion: ${firstViolation}`);
        console.error(trace);
        throw new Error(trace);
      }
    }

    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 [SMART MONKEY] Successfully completed ${step} chaos actions in ${elapsedTotal}s! (Seed: ${seed})\n`);
  });
});
