import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject, pickProject, toProjectDocument } from '@/store/projectDocument';
import { clearHistory } from '@/store/history';
import { DEFAULT_TIMING, type DemoRunSettings, type FrameToShell } from '../protocol';
import type { DemoContext } from './actions';
import type { DemoStep } from './plan';
import { demoFixture } from './testFixture';

/** Each step's UI flow, replaced by a beat on the clock, then the real final write. */
const flow = vi.hoisted(() => ({
  ms: 1000,
  fail: null as string | null,
  calls: [] as string[],
}));
vi.mock('./runners', async (importActual) => {
  const actual = await importActual<typeof import('./runners')>();
  return {
    ...actual,
    runStep: vi.fn(async (ctx: DemoContext, step: DemoStep, file) => {
      flow.calls.push(step.label);
      await ctx.clock.wait(flow.ms);
      if (step.label === flow.fail) throw new Error('flow broke');
      actual.commitStep(step, file);
    }),
  };
});

const { DemoDriver } = await import('./driver');

const file = demoFixture();
const json = JSON.stringify(toProjectDocument(file));
const settings = (patch: Partial<DemoRunSettings> = {}): DemoRunSettings => ({
  timing: { ...DEFAULT_TIMING, betweenSteps: 0 },
  speed: 1,
  mockAi: false,
  aiPrompt: '',
  ...patch,
});

function setup() {
  const sent: FrameToShell[] = [];
  const driver = new DemoDriver((msg) => sent.push(msg));
  const states = () => sent.filter((m) => m.type === 'state').map((m) => (m as { state: string }).state);
  const progress = () => sent.filter((m): m is Extract<FrameToShell, { type: 'progress' }> => m.type === 'progress');
  return { driver, sent, states, progress };
}

beforeEach(() => {
  vi.useFakeTimers();
  flow.ms = 1000;
  flow.fail = null;
  flow.calls = [];
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
  clearHistory();
});
afterEach(() => vi.useRealTimers());

describe('DemoDriver runs', () => {
  it('runs every step in order, reports progress and ends on the file', async () => {
    const { driver, states, progress } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(0);
    expect(driver.runState).toBe('running');
    expect(driver.cursor.hidden).toBe(false);

    await vi.advanceTimersByTimeAsync(11 * 1000);
    expect(progress().map((p) => `${p.step}/${p.total} ${p.label}`)).toEqual([
      '1/11 Map style: dark', '2/11 Project settings', '3/11 Boundary: Spain', '4/11 Boundary: France',
      '5/11 Route: Paris to Lyon', '6/11 Callout: Paris', '7/11 3D model: Tower', '8/11 Timeline',
      '9/11 Camera views', '10/11 Play', '11/11 Export',
    ]);
    expect(states()).toEqual(['ready', 'running', 'done']);
    expect(pickProject(useProjectStore.getState())).toEqual(pickProject(file));
  });

  it('pauses and resumes mid-run, and changes speed', async () => {
    const { driver, states, progress } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(1500);
    expect(progress()).toHaveLength(2);

    await driver.handle({ type: 'pause' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(progress()).toHaveLength(2);
    expect(states()).toEqual(['ready', 'running', 'paused']);

    await driver.handle({ type: 'resume' });
    await driver.handle({ type: 'set-speed', speed: 4 });
    // 500 ms of the second step left, then 250 ms per step at 4x.
    await vi.advanceTimersByTimeAsync(500 / 4 + 250);
    expect(progress()).toHaveLength(4);
    expect(states()).toEqual(['ready', 'running', 'paused', 'running']);
  });

  it('reset stops a run and puts the empty starting project back', async () => {
    const { driver, states, progress } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(2500);
    expect(useProjectStore.getState().mapStyle).toBe('dark');

    await driver.handle({ type: 'reset' });
    expect(driver.runState).toBe('ready');
    expect(useProjectStore.getState()).toMatchObject({ mapStyle: 'standard', name: 'Untitled Project', itemOrder: ['camera-track'] });
    expect(driver.cursor.hidden).toBe(true);
    const seen = progress().length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(progress()).toHaveLength(seen);
    expect(states()).toEqual(['ready', 'running', 'ready']);
  });

  it('starts again from the beginning after a finished run', async () => {
    flow.ms = 10;
    const { driver, progress } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(1000);
    expect(driver.runState).toBe('done');
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(0);
    expect(useProjectStore.getState().mapStyle).toBe('standard');
    await vi.advanceTimersByTimeAsync(1000);
    expect(progress().filter((p) => p.step === 1)).toHaveLength(2);
    expect(pickProject(useProjectStore.getState())).toEqual(pickProject(file));
  });

  it('writes a broken step’s result and carries on', async () => {
    flow.fail = 'Boundary: Spain';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { driver } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(11 * 1000);
    expect(driver.runState).toBe('done');
    expect(useProjectStore.getState().items['b-spain']).toEqual(file.items['b-spain']);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('hides the cursor in mock AI mode and still runs the plan for now', async () => {
    flow.ms = 10;
    const { driver } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings({ mockAi: true }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(driver.cursor.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(driver.runState).toBe('done');
  });

  it('ignores start before a file is loaded, and pause when not running', async () => {
    const { driver, sent } = setup();
    await driver.handle({ type: 'start', settings: settings() });
    await driver.handle({ type: 'pause' });
    expect(sent).toEqual([]);
    expect(flow.calls).toEqual([]);
  });
});
