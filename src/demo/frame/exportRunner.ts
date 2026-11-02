import { useProjectStore } from '@/store/useProjectStore';
import type { Project } from '@/store/types';
import { RESOLUTION_LABELS } from '@/types/render';
import { click, find, pause, query, selectOption, type, warn, type DemoContext } from './actions';
import { FAKE_EXPORT_MS, setFakeExportPace } from './fakeExport';
import { currentLocators, type Locators } from './locators';
import type { DemoStep } from './plan';
import { showMainBar } from './phone';
import { commitStep } from './runners';

/**
 * The export step: the cursor opens the real export modal, sets what differs
 * from the file in it, and clicks Export. The modal runs its own flow (the
 * Export button turns into the progress bar) around a scripted export that
 * fills the bar over a few seconds (`fakeExport.ts`): nothing is encoded and
 * no file is saved. The run ends with the modal in its done state.
 */

/** Real wait for the Export button to come on: the browser's encoder check runs when the modal opens. */
const ENABLE_WAIT_MS = 3000;
/** The bar's Export complete shows for this long (ExportModalFooter's hold), then the buttons return; the run rests a beat after that. */
const DONE_REST_MS = 2600;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Waits up to `ms` of the run's clock for `done()`; whether it came true. Stands still while paused. */
async function until(ctx: DemoContext, done: () => boolean, ms: number): Promise<boolean> {
  const start = ctx.clock.now();
  while (!done() && ctx.clock.now() - start < ms) await ctx.clock.realDelay(50);
  return done();
}

/**
 * Sets the modal's selects, orientation and time range to the project's. They
 * start from the project's own values, except what the modal keeps for itself
 * (its frame rate and end time were read when the editor opened).
 */
async function matchSettings(ctx: DemoContext, L: Locators, file: Project): Promise<void> {
  const selects: [label: string, shown: string][] = [
    ['Aspect ratio', file.aspectRatio],
    ['Resolution', RESOLUTION_LABELS[file.exportResolution]],
    ['Frame rate', `${file.fps} FPS`],
  ];
  for (const [label, shown] of selects) {
    ctx.clock.check();
    const trigger = query(L.exportSelect(label));
    if (trigger && textOf(trigger) !== shown) await selectOption(ctx, trigger, new RegExp(`^${escapeRegExp(shown)}`));
  }

  const orientation = file.isVertical ? 'Portrait' : 'Landscape';
  const choice = query(L.exportChoice('Orientation', orientation));
  if (choice && choice.getAttribute('aria-checked') !== 'true') await click(ctx, choice);

  const times: [label: string, seconds: number][] = [['Start time (s)', 0], ['End time (s)', file.duration]];
  for (const [label, seconds] of times) {
    ctx.clock.check();
    const field = query(L.exportField(label));
    if (field instanceof HTMLInputElement && Number(field.value) !== seconds) await type(ctx, field, String(seconds));
  }
}

/** Opens the modal, sets it up and starts the export; false when the export did not start. */
async function exportOnScreen(ctx: DemoContext, file: Project): Promise<boolean> {
  const L = currentLocators();
  const store = () => useProjectStore.getState();
  if (!query(L.exportDialog)) await showMainBar(ctx, L);
  if (!query(L.exportDialog) && !(await find(ctx, L.exportButton, { timeout: 1500 }) && (await click(ctx, L.exportButton)))) return false;
  if (!(await find(ctx, L.exportDialog, { timeout: 2000 }))) return false;
  await pause(ctx, ctx.timing.betweenSteps * 0.4);
  await matchSettings(ctx, L, file);

  const confirm = await find(ctx, L.exportConfirm);
  if (!confirm) return false;
  if (!(await until(ctx, () => !(confirm as HTMLButtonElement).disabled, ENABLE_WAIT_MS))) {
    warn('the Export button stayed off (this browser cannot encode video)');
    return false;
  }
  if (!(await click(ctx, confirm))) return false;
  if (!(await until(ctx, () => store().isExporting, ENABLE_WAIT_MS))) {
    warn('the export did not start');
    return false;
  }
  // The bar fills on the run's clock; the export ends the way a real one does, with the done state.
  if (!(await until(ctx, () => !store().isExporting, FAKE_EXPORT_MS * 2))) warn('the export did not finish');
  await pause(ctx, DONE_REST_MS);
  return true;
}

export async function runExport(ctx: DemoContext, step: Extract<DemoStep, { kind: 'export' }>, file: Project): Promise<void> {
  setFakeExportPace((ms, frame) => ctx.clock.animate(ms, frame));
  try {
    await exportOnScreen(ctx, file);
  } finally {
    setFakeExportPace(null);
  }
  commitStep(step, file);
}
