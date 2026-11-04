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
  ctx: null as DemoContext | null,
}));
vi.mock('./runners', async (importActual) => {
  const actual = await importActual<typeof import('./runners')>();
  return {
    ...actual,
    runStep: vi.fn(async (ctx: DemoContext, step: DemoStep, file) => {
      flow.ctx = ctx;
      flow.calls.push(step.label);
      await ctx.clock.wait(flow.ms);
      if (step.label === flow.fail) throw new Error('flow broke');
      actual.commitStep(step, file);
    }),
  };
});

/** Mock AI mode, replaced by a beat on the clock: its own tests are in ai/. */
const ai = vi.hoisted(() => ({ runs: 0, teardowns: 0, ms: 1000, settings: null as unknown }));
vi.mock('./ai/mode', () => ({
  AiMode: class {
    async run(ctx: DemoContext, _file: unknown, settings: unknown) {
      ai.runs++;
      ai.settings = settings;
      await ctx.clock.wait(ai.ms);
    }
    teardown() {
      ai.teardowns++;
    }
  },
}));

const { DemoDriver } = await import('./driver');

const file = demoFixture();
const json = JSON.stringify(toProjectDocument(file));
const settings = (patch: Partial<DemoRunSettings> = {}): DemoRunSettings => ({
  timing: { ...DEFAULT_TIMING, betweenSteps: 0 },
  speed: 1,
  mockAi: false,
  aiPrompt: '',
  autoZoom: false,
  maxZoom: 1.8,
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
  flow.ctx = null;
  ai.runs = 0;
  ai.teardowns = 0;
  ai.ms = 1000;
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

  it('opens and closes the run on the whole stage and gives the primitives a way to report focus', async () => {
    const { driver, sent } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings() });
    await vi.advanceTimersByTimeAsync(0);
    const focuses = () => sent.filter((m) => m.type === 'focus');
    expect(focuses()).toEqual([{ type: 'focus', rect: null, intent: 'work' }]);
    expect(flow.ctx?.focus).toBeTypeOf('function');
    flow.ctx?.focus?.({ rect: { x: 1, y: 2, width: 3, height: 4 }, intent: 'wide' });
    expect(focuses().at(-1)).toEqual({ type: 'focus', rect: { x: 1, y: 2, width: 3, height: 4 }, intent: 'wide' });
    await vi.advanceTimersByTimeAsync(11 * 1000);
    expect(focuses().at(-1)).toEqual({ type: 'focus', rect: null, intent: 'work' });
    await driver.handle({ type: 'reset' });
    expect(focuses().length).toBeGreaterThan(2);
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

  it('runs the AI pass instead of the plan in mock AI mode, with the cursor in view for it', async () => {
    const { driver, states, progress } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings({ mockAi: true, aiPrompt: 'Make a trip' }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(driver.runState).toBe('running');
    expect(driver.cursor.hidden).toBe(false);
    expect(ai.settings).toMatchObject({ mockAi: true, aiPrompt: 'Make a trip' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states()).toEqual(['ready', 'running', 'done']);
    expect(flow.calls).toEqual([]);
    expect(progress()).toEqual([]);
  });

  it('pauses, resumes and resets the AI pass like any run, tearing the AI mode down', async () => {
    const { driver, states } = setup();
    await driver.handle({ type: 'load', fileName: 'tour.json', json });
    void driver.handle({ type: 'start', settings: settings({ mockAi: true }) });
    await vi.advanceTimersByTimeAsync(400);
    await driver.handle({ type: 'pause' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(driver.runState).toBe('paused');
    await driver.handle({ type: 'resume' });
    await driver.handle({ type: 'set-speed', speed: 2 });
    await vi.advanceTimersByTimeAsync(300 + 1);
    expect(driver.runState).toBe('done');

    void driver.handle({ type: 'start', settings: settings({ mockAi: true }) });
    await vi.advanceTimersByTimeAsync(100);
    const before = ai.teardowns;
    await driver.handle({ type: 'reset' });
    expect(ai.teardowns).toBeGreaterThan(before);
    expect(driver.runState).toBe('ready');
    expect(driver.cursor.hidden).toBe(true);
    expect(states().at(-1)).toBe('ready');
  });

  it('ignores start before a file is loaded, and pause when not running', async () => {
    const { driver, sent } = setup();
    await driver.handle({ type: 'start', settings: settings() });
    await driver.handle({ type: 'pause' });
    expect(sent).toEqual([]);
    expect(flow.calls).toEqual([]);
  });
});
