import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { saveAs } from 'file-saver';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportModal from '@/components/ExportModal/ExportModal';
import { ToolbarButton } from '@/components/Toolbar/ToolbarPrimitives';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { query } from './actions';
import { isDemoAborted } from './clock';
import { currentLocators } from './locators';
import { FAKE_EXPORT_MS } from './fakeExport';
import type { DemoStep } from './plan';
import { runStep } from './runners';
import { startingProject } from './startState';
import { testContext } from './testContext';
import { demoFixture } from './testFixture';

vi.mock('@/demo/isDemo', () => ({ IS_DEMO: true, IS_DEMO_FRAME: true, IS_DEMO_SHELL: false }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
vi.mock('@/services/localExportCapability', () => ({ getLocalExportCapability: vi.fn(async () => ({ status: 'ready', codec: 'avc1.640028' })) }));
vi.mock('@/lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
  setPersonProps: vi.fn(),
}));

/** The toolbar's Export button and the modal it opens, as the editor has them. */
function Editor() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ToolbarButton label="Export" icon={null} hideLabel onClick={() => setOpen(true)} walkthroughTarget="render" />
      <ExportModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const file = { ...demoFixture(), fps: 60 as const, duration: 45 };
const step: DemoStep = { kind: 'export', label: 'Export' };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  // Radix Select needs these from the DOM.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  useProjectStore.setState({ ...startingProject(file), ...createTransientState(), duration: 30 });
  vi.mocked(saveAs).mockClear();
});

afterEach(() => {
  warn.mockRestore();
});

/** What the modal opened with, then what the settings step changed in the project: the modal keeps its own frame rate and end time. */
function renderEditorThenSetProject() {
  render(<Editor />);
  useProjectStore.setState({ fps: file.fps, duration: file.duration });
}

describe('export runner', () => {
  it('opens the modal, matches the project’s settings, fills the bar on the run’s clock and ends in the done state, with no download', async () => {
    renderEditorThenSetProject();
    const exporting: boolean[] = [];
    const unsubscribe = useProjectStore.subscribe((s, prev) => {
      if (s.isExporting !== prev.isExporting) exporting.push(s.isExporting);
    });
    // The bar as the screen shows it, sampled while the export runs.
    const bar: number[] = [];
    const sampler = setInterval(() => {
      const value = document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow');
      if (value !== undefined && value !== null) bar.push(Number(value));
    }, 10);

    const speed = 10;
    const started = Date.now();
    await runStep(testContext(speed), step, file);
    clearInterval(sampler);
    unsubscribe();

    expect(exporting).toEqual([true, false]);
    // Opened with the modal's own frame rate and end time (30 and 30): both were set to the project's.
    expect(screen.getAllByRole('combobox').map((el) => el.textContent)).toContain('60 FPS');
    expect((query(currentLocators().exportField('End time (s)')) as HTMLInputElement).value).toBe('45');
    // The bar filled from the start to full, in steps, and over the run's own (scaled) few seconds.
    expect(bar[0]).toBe(0);
    expect(Math.max(...bar)).toBe(100);
    expect(bar.filter((v, i) => v > 0 && v < 100 && v !== bar[i - 1]).length).toBeGreaterThan(2);
    expect(bar).toEqual([...bar].sort((a, b) => a - b));
    expect(Date.now() - started).toBeLessThan(FAKE_EXPORT_MS);
    // Left in the modal's done state, and nothing was saved.
    expect(screen.getByText('Export complete. The browser downloaded the file.')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Export progress' })).toHaveAttribute('aria-valuenow', '100');
    expect(saveAs).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(useProjectStore.getState().mapCenter).toEqual(file.mapCenter);
  }, 30_000);

  it('leaves the modal cancelled, not failed, when the run is reset mid-export', async () => {
    renderEditorThenSetProject();
    const ctx = testContext(10);
    const run = runStep(ctx, step, file).catch((error) => error);
    while (!useProjectStore.getState().isExporting) await sleep(10);
    ctx.clock.cancel();
    expect(isDemoAborted(await run)).toBe(true);
    await sleep(50);
    expect(useProjectStore.getState().isExporting).toBe(false);
    expect(screen.queryByText(/Export failed|aborted/i)).toBeNull();
    expect(screen.queryByText('Export complete. The browser downloaded the file.')).toBeNull();
    expect(saveAs).not.toHaveBeenCalled();
  }, 30_000);

  it('still ends on the file when the modal cannot be opened', async () => {
    await runStep(testContext(), step, file);
    expect(useProjectStore.getState().mapCenter).toEqual(file.mapCenter);
    expect(warn).toHaveBeenCalled();
  }, 15_000);
});
