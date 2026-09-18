import type { Page } from '@playwright/test';
import type { SeededRandom } from './prng';
import type { FlightRecorder } from './flightRecorder';

export interface SmartMonkeyAction {
  category: 'timeline' | 'canvas' | 'drafting' | 'inspector' | 'modal' | 'keyboard';
  name: string;
  weight: number;
  execute: (page: Page, rng: SeededRandom, recorder: FlightRecorder) => Promise<void>;
}

export const smartMonkeyActions: SmartMonkeyAction[] = [
  // ===========================================================================
  // 1. TIMELINE & PLAYBACK (Weight: 25)
  // ===========================================================================
  {
    category: 'timeline',
    name: 'Toggle Play / Pause',
    weight: 8,
    execute: async (page, _rng, recorder) => {
      recorder.record('timeline', 'Toggle Play / Pause');
      const playBtn = page.getByTitle(/Play \/ Pause/i);
      if (await playBtn.isVisible().catch(() => false)) {
        await playBtn.click().catch(() => {});
      } else {
        await page.keyboard.press('Space').catch(() => {});
      }
    },
  },
  {
    category: 'timeline',
    name: 'Scrub Playhead (Random Time)',
    weight: 8,
    execute: async (page, rng, recorder) => {
      const duration = await page
        .evaluate(() => (window as unknown as { __projectStore?: { getState: () => { duration: number } } }).__projectStore?.getState().duration ?? 30)
        .catch(() => 30);

      const targetTime = rng.weightedPick([
        { item: 0, weight: 15 },
        { item: duration, weight: 15 },
        { item: Number(rng.float(0, duration).toFixed(2)), weight: 60 },
        { item: -0.1, weight: 5 }, // boundary negative
        { item: duration + 0.5, weight: 5 }, // boundary overflow
      ]);

      recorder.record('timeline', 'Scrub Playhead', { duration, targetTime });
      await page.evaluate((t) => {
        const store = (window as unknown as { __projectStore?: { getState: () => { setPlayheadTime: (time: number) => void } } }).__projectStore;
        store?.getState().setPlayheadTime(t);
      }, targetTime).catch(() => {});
    },
  },
  {
    category: 'timeline',
    name: 'Add Camera Keyframe',
    weight: 5,
    execute: async (page, _rng, recorder) => {
      recorder.record('timeline', 'Add Camera Keyframe');
      const kfBtn = page.getByTitle('Camera KF');
      if (await kfBtn.isVisible().catch(() => false)) {
        await kfBtn.click().catch(() => {});
      }
    },
  },
  {
    category: 'timeline',
    name: 'Select Timeline Track / Item',
    weight: 4,
    execute: async (page, rng, recorder) => {
      const tracks = await page.locator('[data-testid="timeline-viewport-content"] [role="button"], .timeline-track-item').all().catch(() => []);
      if (tracks.length > 0) {
        const target = rng.pick(tracks);
        recorder.record('timeline', 'Click Timeline Track Item');
        await target.click({ force: true }).catch(() => {});
      }
    },
  },

  // ===========================================================================
  // 2. MAP CANVAS GESTURES (Weight: 25)
  // ===========================================================================
  {
    category: 'canvas',
    name: 'Pan Map Canvas',
    weight: 8,
    execute: async (page, rng, recorder) => {
      const canvas = page.locator('.mapboxgl-canvas');
      const bounds = await canvas.boundingBox().catch(() => null);
      if (!bounds) return;

      const fromX = bounds.x + rng.int(100, Math.max(120, bounds.width - 100));
      const fromY = bounds.y + rng.int(100, Math.max(120, bounds.height - 100));
      const toX = fromX + rng.int(-150, 150);
      const toY = fromY + rng.int(-150, 150);

      recorder.record('canvas', 'Pan Map', { from: [fromX, fromY], to: [toX, toY] });
      await page.mouse.move(fromX, fromY);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(toX, toY, { steps: 5 });
      await page.mouse.up({ button: 'left' });
    },
  },
  {
    category: 'canvas',
    name: 'Pitch & Rotate Map (Right-Drag)',
    weight: 7,
    execute: async (page, rng, recorder) => {
      const canvas = page.locator('.mapboxgl-canvas');
      const bounds = await canvas.boundingBox().catch(() => null);
      if (!bounds) return;

      const fromX = bounds.x + bounds.width / 2;
      const fromY = bounds.y + bounds.height / 2;
      const toX = fromX + rng.int(-100, 100);
      const toY = fromY + rng.int(-80, 80);

      recorder.record('canvas', 'Pitch & Rotate', { from: [fromX, fromY], to: [toX, toY] });
      await page.mouse.move(fromX, fromY);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(toX, toY, { steps: 5 });
      await page.mouse.up({ button: 'right' });
    },
  },
  {
    category: 'canvas',
    name: 'Zoom Map Canvas (Wheel)',
    weight: 5,
    execute: async (page, rng, recorder) => {
      const canvas = page.locator('.mapboxgl-canvas');
      const bounds = await canvas.boundingBox().catch(() => null);
      if (!bounds) return;

      const deltaY = rng.pick([-200, -100, 100, 200]);
      recorder.record('canvas', 'Zoom Map (Wheel)', { deltaY });
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.wheel(0, deltaY);
    },
  },
  {
    category: 'canvas',
    name: 'Click Canvas Point (Pick on Map)',
    weight: 5,
    execute: async (page, rng, recorder) => {
      const canvas = page.locator('.mapboxgl-canvas');
      const bounds = await canvas.boundingBox().catch(() => null);
      if (!bounds) return;

      const x = bounds.x + rng.int(80, Math.max(100, bounds.width - 80));
      const y = bounds.y + rng.int(80, Math.max(100, bounds.height - 80));

      recorder.record('canvas', 'Click Canvas Point', { x, y });
      await page.mouse.click(x, y).catch(() => {});
    },
  },

  // ===========================================================================
  // 3. DRAFTING TOOLS (Weight: 20)
  // ===========================================================================
  {
    category: 'drafting',
    name: 'Interact Route Tool',
    weight: 8,
    execute: async (page, rng, recorder) => {
      const routeDropdown = page.getByRole('menu');
      const isOpen = await routeDropdown.isVisible().catch(() => false);

      if (!isOpen) {
        recorder.record('drafting', 'Open Route Tool');
        await page.getByTitle('Plan Route').click().catch(() => {});
      } else {
        const subAction = rng.pick(['pickMode', 'pickMap', 'previewOrInsert', 'close']);
        recorder.record('drafting', `Route Tool: ${subAction}`);
        if (subAction === 'pickMode') {
          const mode = rng.pick(['Flight', 'Car', 'Walk']);
          await routeDropdown.getByRole('radio', { name: mode }).click().catch(() => {});
        } else if (subAction === 'pickMap') {
          const pickButtons = await routeDropdown.getByTitle('Pick on Map').all().catch(() => []);
          if (pickButtons.length > 0) {
            await rng.pick(pickButtons).click().catch(() => {});
          }
        } else if (subAction === 'previewOrInsert') {
          const insertBtn = routeDropdown.getByRole('button', { name: 'Insert route' });
          if (await insertBtn.isVisible().catch(() => false)) {
            await insertBtn.click().catch(() => {});
          } else {
            const previewBtn = routeDropdown.getByRole('button', { name: 'Preview path' });
            await previewBtn.click().catch(() => {});
          }
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
    },
  },
  {
    category: 'drafting',
    name: 'Interact Callout Tool',
    weight: 6,
    execute: async (page, rng, recorder) => {
      const calloutDropdown = page.getByRole('menu');
      const isOpen = await calloutDropdown.isVisible().catch(() => false);

      if (!isOpen) {
        recorder.record('drafting', 'Open Callout Tool');
        await page.getByTitle('Add Callout').click().catch(() => {});
      } else {
        const subAction = rng.pick(['fillTitle', 'pickMap', 'submit', 'close']);
        recorder.record('drafting', `Callout Tool: ${subAction}`);
        if (subAction === 'fillTitle') {
          const titleInput = calloutDropdown.getByPlaceholder('Callout title');
          if (await titleInput.isVisible().catch(() => false)) {
            await titleInput.fill(rng.fuzzyString()).catch(() => {});
          }
        } else if (subAction === 'pickMap') {
          const pickBtn = calloutDropdown.getByTitle('Pick on Map');
          await pickBtn.click().catch(() => {});
        } else if (subAction === 'submit') {
          const submitBtn = calloutDropdown.getByRole('button', { name: 'Create callout' });
          await submitBtn.click().catch(() => {});
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
    },
  },
  {
    category: 'drafting',
    name: 'Interact Boundary Tool',
    weight: 6,
    execute: async (page, rng, recorder) => {
      const boundaryDropdown = page.getByRole('menu');
      const isOpen = await boundaryDropdown.isVisible().catch(() => false);

      if (!isOpen) {
        recorder.record('drafting', 'Open Boundary Tool');
        await page.getByTitle('Add Boundary').click().catch(() => {});
      } else {
        const subAction = rng.pick(['search', 'insert', 'close']);
        recorder.record('drafting', `Boundary Tool: ${subAction}`);
        if (subAction === 'search') {
          const searchInput = boundaryDropdown.getByPlaceholder(/Search for a place/i);
          if (await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill(rng.pick(['Testland', 'Paris', 'Tokyo', 'Berlin'])).catch(() => {});
            await searchInput.press('Enter').catch(() => {});
          }
        } else if (subAction === 'insert') {
          const insertBtn = boundaryDropdown.getByRole('button', { name: 'Insert boundary' });
          await insertBtn.click().catch(() => {});
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
    },
  },

  // ===========================================================================
  // 4. INSPECTOR PANEL FUZZING (Weight: 20)
  // ===========================================================================
  {
    category: 'inspector',
    name: 'Fuzz Inspector Text / Numeric Inputs',
    weight: 12,
    execute: async (page, rng, recorder) => {
      const inputs = await page.locator('aside input:not([type="checkbox"]):not([type="radio"]), [data-panel="inspector"] input').all().catch(() => []);
      if (inputs.length === 0) {
        recorder.record('inspector', 'No Inspector Inputs Visible');
        return;
      }

      const input = rng.pick(inputs);
      const isNumber = (await input.getAttribute('type').catch(() => '')) === 'number';
      const fuzzedValue = isNumber ? String(rng.fuzzyNumber()) : rng.fuzzyString();

      recorder.record('inspector', 'Fuzz Inspector Input', { value: fuzzedValue });
      await input.fill(fuzzedValue).catch(() => {});
      if (rng.boolean(0.5)) {
        await input.press('Enter').catch(() => {});
      }
    },
  },
  {
    category: 'inspector',
    name: 'Toggle Inspector Switches / Controls',
    weight: 5,
    execute: async (page, rng, recorder) => {
      const switches = await page.locator('aside button[role="switch"], aside [role="checkbox"]').all().catch(() => []);
      if (switches.length > 0) {
        const sw = rng.pick(switches);
        recorder.record('inspector', 'Toggle Switch');
        await sw.click().catch(() => {});
      }
    },
  },
  {
    category: 'inspector',
    name: 'Delete Selected Item (Delete Key / Button)',
    weight: 3,
    execute: async (page, _rng, recorder) => {
      recorder.record('inspector', 'Delete Selected Item');
      await page.keyboard.press('Delete').catch(() => {});
    },
  },

  // ===========================================================================
  // 5. MODALS & GLOBAL KEYBOARD CHAOS (Weight: 10)
  // ===========================================================================
  {
    category: 'modal',
    name: 'Toggle Export Dialog',
    weight: 4,
    execute: async (page, _rng, recorder) => {
      const exportDialog = page.getByRole('dialog', { name: 'Export' });
      if (await exportDialog.isVisible().catch(() => false)) {
        recorder.record('modal', 'Close Export Dialog');
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        recorder.record('modal', 'Open Export Dialog');
        await page.getByTitle('Export').click().catch(() => {});
      }
    },
  },
  {
    category: 'modal',
    name: 'Toggle Map Settings',
    weight: 3,
    execute: async (page, _rng, recorder) => {
      recorder.record('modal', 'Click Map Settings');
      const settingsBtn = page.getByTitle('Map Settings');
      if (await settingsBtn.isVisible().catch(() => false)) {
        await settingsBtn.click().catch(() => {});
      }
    },
  },
  {
    category: 'keyboard',
    name: 'Random Keyboard Shortcut',
    weight: 3,
    execute: async (page, rng, recorder) => {
      const key = rng.pick(['Escape', 'Backspace', 'Control+z', 'Control+y', 'ArrowLeft', 'ArrowRight']);
      recorder.record('keyboard', `Key Press: ${key}`);
      await page.keyboard.press(key).catch(() => {});
    },
  },
];
