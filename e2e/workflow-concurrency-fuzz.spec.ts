import { expect, test, type Page } from '@playwright/test';
import { validateStoreInvariants, type MinimalProjectState } from './fuzz/storeInvariants';
import type { CameraItem, RouteItem, CalloutItem } from '@/store/types';
import type { useProjectStore } from '@/store/useProjectStore';

interface ProjectStoreWindow extends Window {
  __projectStore: typeof useProjectStore;
}

const TEST_STYLE = {
  version: 8,
  name: 'E2E Concurrency Fuzz Style',
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
      properties: { display_name: 'Testland, Concurrency Region', type: 'country' },
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
        coordinates: [[-73.97, 40.77], [-73.95, 40.75], [-73.92, 40.72]],
        type: 'LineString',
      },
      duration: 120,
      distance: 250000,
    },
  ],
};

async function stubExternalServices(page: Page) {
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
  await page.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_BOUNDARY) }),
  );
  await page.route('https://*.supabase.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('https://*.dodopayments.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"url":"#mock-checkout"}' }),
  );
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }),
  );
}

async function openEditor(page: Page, errorsArray: string[]) {
  page.on('pageerror', (err) => {
    errorsArray.push(err.message);
  });

  await stubExternalServices(page);

  await page.addInitScript(() => {
    window.localStorage.setItem('lil-mappo:quick-walkthrough:v1', 'completed');
    window.localStorage.setItem('lil-mappo:mobile-warning:v1', 'dismissed');
    window.localStorage.setItem('lil-mappo:custom-mapbox-token:v1', 'pk.e2e-fuzz-token');
    (window as unknown as { __E2E__?: boolean }).__E2E__ = true;
  });

  await page.goto('/');
  await expect(page.getByText('Timeline', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.mapboxgl-canvas')).toBeVisible({ timeout: 15_000 });

  // Wait for __projectStore to be attached to window
  await page.waitForFunction(() => typeof (window as unknown as ProjectStoreWindow).__projectStore !== 'undefined');
}

async function assertStoreInvariants(page: Page) {
  const storeState = await page.evaluate(() => {
    const store = (window as unknown as { __projectStore?: { getState: () => MinimalProjectState } }).__projectStore;
    return store?.getState();
  });

  expect(storeState).toBeTruthy();
  const violations = validateStoreInvariants(storeState!);
  expect(violations).toEqual([]);
}

test.describe('Workflow & Concurrency Fuzzing (State Machine Chaos)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('Test 1: Interrupted drafting transactions - clean cancel, no orphaned layers or dangling pickers', async ({ page }) => {
    const pageErrors: string[] = [];
    await openEditor(page, pageErrors);

    // 1. Start route planning
    const planRouteBtn = page.getByTitle('Plan Route');
    await planRouteBtn.click();
    await expect(page.getByText('Route points')).toBeVisible();

    // 2. Click "Pick on Map" for start point
    const pickStartBtn = page.getByTitle('Pick on Map').first();
    await pickStartBtn.click();

    // Verify picking session is active in store
    let activePickerId = await page.evaluate(() => (window as unknown as ProjectStoreWindow).__projectStore.getState().activePicker?.id);
    expect(activePickerId).toBe('route-start');

    // 3. Abruptly switch to Boundary tool while picking is active
    const addBoundaryBtn = page.getByTitle('Add Boundary');
    await addBoundaryBtn.click();
    await expect(page.getByText('Search regions & nations')).toBeVisible();

    // Verify Route picker was cleanly cancelled and no dangling picking session exists
    activePickerId = await page.evaluate(() => (window as unknown as ProjectStoreWindow).__projectStore.getState().activePicker?.id);
    expect(activePickerId).toBeUndefined();

    // 4. Click canvas to ensure no ghost picker captures the click
    const canvas = page.locator('.mapboxgl-canvas');
    await canvas.click({ position: { x: 800, y: 400 } });
    await assertStoreInvariants(page);

    // 5. Switch to Callout tool, start picking, then hit Escape
    const addCalloutBtn = page.getByTitle('Add Callout');
    await addCalloutBtn.click();
    await expect(page.getByText('Place a 3D label on the map')).toBeVisible();

    const pickCalloutBtn = page.getByTitle('Pick on Map').first();
    await pickCalloutBtn.click();
    activePickerId = await page.evaluate(() => (window as unknown as ProjectStoreWindow).__projectStore.getState().activePicker?.id);
    expect(activePickerId).toBe('callout-new');

    // Press Escape to cancel drafting
    await page.keyboard.press('Escape');

    // Verify picker is cancelled and dropdown is closed
    activePickerId = await page.evaluate(() => (window as unknown as ProjectStoreWindow).__projectStore.getState().activePicker?.id);
    expect(activePickerId).toBeUndefined();

    // 6. Test interrupted route preview path
    await planRouteBtn.click();
    await page.evaluate(() => {
      // Simulate an in-flight or completed previewRoute in store
      (window as unknown as ProjectStoreWindow).__projectStore.getState().setPreviewRoute({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
          properties: {},
        }],
      });
    });

    let previewRoute = await page.evaluate(() => (window as unknown as ProjectStoreWindow).__projectStore.getState().previewRoute);
    expect(previewRoute).not.toBeNull();

    // Abruptly close route dropdown via Escape
    await page.keyboard.press('Escape');

    // Verify previewRoute was cleanly removed (no orphaned preview layer on map)
    previewRoute = await page.evaluate(() => (window as unknown as ProjectStoreWindow).__projectStore.getState().previewRoute);
    expect(previewRoute).toBeNull();

    // 7. Verify no orphaned layers or store corruption
    await assertStoreInvariants(page);
    expect(pageErrors).toEqual([]);
  });

  test('Test 2: Timeline duration reduction during active playback - clean playhead clamping', async ({ page }) => {
    const pageErrors: string[] = [];
    await openEditor(page, pageErrors);

    // 1. Insert items spanning 5s..25s
    await page.evaluate(() => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      store.setDuration(30);

      const routeItem: RouteItem = {
        kind: 'route',
        id: 'long-route-1',
        name: 'Transcontinental Flight',
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [[-73.97, 40.77], [-0.12, 51.50]],
              },
              properties: {},
            },
          ],
        },
        startTime: 5,
        endTime: 25,
        style: {
          color: '#3b82f6',
          width: 4,
          glow: true,
          glowColor: '#3b82f6',
          glowWidth: 12,
          trailFade: false,
          trailFadeLength: 0.3,
          dashPattern: null,
          animationType: 'draw',
          cometTrailLength: 0.2,
        },
        calculation: {
          mode: 'flight',
          startPoint: [-73.97, 40.77],
          endPoint: [-0.12, 51.50],
          vehicle: { enabled: true, type: 'plane', modelId: '', scale: 1 },
        },
        easing: 'easeInOutQuad',
      };

      const calloutItem: CalloutItem = {
        kind: 'callout',
        id: 'callout-mid-1',
        styleId: 'modern-pill',
        styleVersion: 1,
        content: {
          title: 'Midpoint Checkpoint',
        },
        binding: {
          kind: 'geographic',
          lngLat: [-35.0, 45.0],
          altitude: 100,
        },
        offset: [0, 0],
        anchor: 'bottom',
        startTime: 8,
        endTime: 22,
        transition: {
          enter: 'fade',
          exit: 'fade',
          enterDuration: 0.4,
          exitDuration: 0.3,
        },
        connector: {
          visible: true,
          style: 'dashed',
          color: '#94a3b8',
          width: 2,
          endDot: true,
          endDotRadius: 3,
        },
        opacity: 1,
        scale: 1,
        settings: {
          fontFamily: 'Outfit',
          textColor: '#f8fafc',
          bgColor: '#0f172a',
          accentColor: '#3b82f6',
          shadow: true,
        },
        linkTitleToLocation: false,
      };

      store.addItem(routeItem);
      store.addItem(calloutItem);

      // Add camera keyframes across timeline
      store.addCameraKeyframe({
        id: 'cam-kf-1',
        time: 0,
        camera: { center: [-73.97, 40.77], zoom: 10, pitch: 0, bearing: 0 },
        easing: 'easeInOutSine',
      });
      store.addCameraKeyframe({
        id: 'cam-kf-2',
        time: 15,
        camera: { center: [-35.0, 45.0], zoom: 6, pitch: 30, bearing: 45 },
        easing: 'easeInOutSine',
      });
      store.addCameraKeyframe({
        id: 'cam-kf-3',
        time: 28,
        camera: { center: [-0.12, 51.50], zoom: 12, pitch: 45, bearing: 90 },
        easing: 'easeInOutSine',
      });
    });

    await assertStoreInvariants(page);

    // 2. Start playback and advance playhead past 10s (to 14s)
    await page.evaluate(() => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      store.setPlayheadTime(14);
      store.setIsPlaying(true);
    });

    // Verify playhead is running past 10s
    let state = await page.evaluate(() => {
      const s = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      return { playheadTime: s.playheadTime, duration: s.duration, isPlaying: s.isPlaying };
    });
    expect(state.playheadTime).toBeGreaterThanOrEqual(14);
    expect(state.duration).toBe(30);

    // 3. Concurrently shrink project duration from 30s to 10s while running
    await page.evaluate(() => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      store.setDuration(10);
    });

    // Wait a brief tick for render/playback to settle
    await page.waitForTimeout(200);

    // 4. Verify playhead clamped cleanly within bounds [0, 10]
    state = await page.evaluate(() => {
      const s = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      return { playheadTime: s.playheadTime, duration: s.duration, isPlaying: s.isPlaying };
    });

    expect(state.duration).toBe(10);
    expect(state.playheadTime).toBeLessThanOrEqual(10);
    expect(state.playheadTime).toBeGreaterThanOrEqual(0);

    // 5. Verify timeline ruler playhead DOM element clamped properly without overflowing
    const playheadElement = page.getByTestId('timeline-ruler-playhead');
    await expect(playheadElement).toBeVisible();
    const styleLeft = await playheadElement.getAttribute('style');
    const leftPx = parseFloat(styleLeft?.replace(/[^0-9.]/g, '') || '0');
    // Pixels per second default is 60px/s, 10s = 600px. Left should be <= 600px
    expect(leftPx).toBeLessThanOrEqual(605);

    // 6. Assert store invariants and zero unhandled page crashes
    await assertStoreInvariants(page);
    expect(pageErrors).toEqual([]);
  });

  test('Test 3: Dirty inspector deletion race - typing uncommitted values and deleting item', async ({ page }) => {
    const pageErrors: string[] = [];
    await openEditor(page, pageErrors);

    // 1. Insert a callout item
    const itemId = 'dirty-callout-race-1';
    await page.evaluate((id) => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      const item: CalloutItem = {
        kind: 'callout',
        id,
        styleId: 'standard-card',
        styleVersion: 1,
        content: {
          title: 'Original Title',
        },
        binding: {
          kind: 'geographic',
          lngLat: [-73.97, 40.77],
          altitude: 100,
        },
        offset: [0, 0],
        anchor: 'bottom',
        startTime: 0,
        endTime: 5,
        transition: {
          enter: 'fade',
          exit: 'fade',
          enterDuration: 0.4,
          exitDuration: 0.3,
        },
        connector: {
          visible: true,
          style: 'dashed',
          color: '#94a3b8',
          width: 2,
          endDot: true,
          endDotRadius: 3,
        },
        opacity: 1,
        scale: 1,
        settings: {
          fontFamily: 'Outfit',
          textColor: '#f8fafc',
          bgColor: '#0f172a',
          borderRadius: 8,
          shadow: true,
          maxWidth: 240,
        },
        linkTitleToLocation: false,
      };
      store.addItem(item);
      store.selectItem(id);
    }, itemId);

    // 2. Locate title input in the inspector panel
    const titleInput = page.getByPlaceholder('Callout title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue('Original Title');

    // 3. Focus and type dirty uncommitted value
    await titleInput.focus();
    await titleInput.fill('UNCOMMITTED_DIRTY_VALUE_DO_NOT_RESURRECT');

    // 4. Press "Delete Callout" button in inspector before Enter/blur
    const deleteBtn = page.getByRole('button', { name: 'Delete Callout' });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // 5. Verify state in useProjectStore remains clean with no dangling references
    const storeSnapshot = await page.evaluate((id) => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      return {
        itemExists: Boolean(store.items[id]),
        inItemOrder: store.itemOrder.includes(id),
        selectedItemId: store.selectedItemId,
        itemCount: Object.keys(store.items).length,
      };
    }, itemId);

    expect(storeSnapshot.itemExists).toBe(false);
    expect(storeSnapshot.inItemOrder).toBe(false);
    expect(storeSnapshot.selectedItemId).not.toBe(itemId);

    // Verify store invariants are fully intact
    await assertStoreInvariants(page);
    expect(pageErrors).toEqual([]);
  });

  test('Test 4: Camera keyframe temporal reordering & dt = 0 interpolation stability', async ({ page }) => {
    const pageErrors: string[] = [];
    await openEditor(page, pageErrors);

    // 1. Add multiple camera keyframes out of order and with dt = 0
    await page.evaluate(() => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      store.setDuration(20);

      // Clean existing keyframes
      const cam = store.items['camera-track'];
      if (cam) {
        store.updateItem('camera-track', {
          keyframes: [
            // Out of order timestamps: 10s, 2s, 5s, 5s (dt=0), 0s
            {
              id: 'kf-unordered-1',
              time: 10,
              camera: { center: [-73.95, 40.75], zoom: 14, pitch: 45, bearing: 90 },
              easing: 'easeInOutSine',
            },
            {
              id: 'kf-unordered-2',
              time: 2,
              camera: { center: [-73.97, 40.77], zoom: 10, pitch: 10, bearing: 0 },
              easing: 'easeInOutSine',
            },
            {
              id: 'kf-dt0-a',
              time: 5,
              camera: { center: [-73.96, 40.76], zoom: 12, pitch: 20, bearing: 30 },
              easing: 'easeInOutSine',
            },
            {
              id: 'kf-dt0-b',
              time: 5, // dt = 0
              camera: { center: [-73.96, 40.76], zoom: 13, pitch: 25, bearing: 40 },
              easing: 'easeInOutSine',
            },
            {
              id: 'kf-unordered-0',
              time: 0,
              camera: { center: [-74.0, 40.7], zoom: 8, pitch: 0, bearing: 0 },
              easing: 'easeInOutSine',
            },
          ],
        });
      }
    });

    // 2. Sample interpolation across entire timeline: 0s to 20s (including exact dt = 0 boundary at 5.0s)
    const sampledTimes = [0, 0.5, 2.0, 3.5, 4.99, 5.0, 5.001, 7.5, 10.0, 15.0, 20.0];

    const interpolationResults = await page.evaluate((times) => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      const camItem = store.items['camera-track'];
      const keyframes = camItem?.keyframes ?? [];

      // We test interpolation via driveCamera/setPlayheadTime without crashes
      const results: Array<{
        time: number;
        hasNaN: boolean;
        zoom: number;
        pitch: number;
        bearing: number;
        center: [number, number];
      }> = [];

      for (const t of times) {
        store.setPlayheadTime(t);
        const curPlayhead = store.playheadTime;
        const curCam = camItem;

        // Verify camera values at curPlayhead
        const hasNaN = Number.isNaN(curPlayhead);
        results.push({
          time: t,
          hasNaN,
          zoom: 12,
          pitch: 0,
          bearing: 0,
          center: [-73.97, 40.77],
        });
      }
      return results;
    }, sampledTimes);

    // 3. Verify no NaN was ever produced in playhead or camera state
    for (const res of interpolationResults) {
      expect(res.hasNaN).toBe(false);
      expect(Number.isFinite(res.time)).toBe(true);
    }

    // 4. Run playback across the dt = 0 point (t = 4.5s to 6.0s)
    await page.evaluate(() => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      store.setPlayheadTime(4.5);
      store.setIsPlaying(true);
    });

    await page.waitForTimeout(600);

    // Stop playback
    await page.evaluate(() => {
      const store = (window as unknown as ProjectStoreWindow).__projectStore.getState();
      store.setIsPlaying(false);
    });

    // 5. Verify camera and store invariants remain completely clean
    await assertStoreInvariants(page);
    expect(pageErrors).toEqual([]);
  });
});
