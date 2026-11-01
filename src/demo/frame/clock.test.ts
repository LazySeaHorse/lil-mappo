import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoAborted, DemoClock, isDemoAborted } from './clock';

describe('DemoClock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const clock = (speed = 1) => new DemoClock({ speed, now: () => Date.now() });

  /** Resolves `done` when the promise settles, so a test can check it without awaiting. */
  function track(promise: Promise<unknown>) {
    const state = { done: false, error: null as unknown };
    promise.then(() => { state.done = true; }, (error) => { state.error = error; });
    return state;
  }

  it('waits the given time at speed 1', async () => {
    const c = clock();
    const w = track(c.wait(500));
    await vi.advanceTimersByTimeAsync(499);
    expect(w.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.done).toBe(true);
  });

  it('runs faster at a higher speed', async () => {
    const c = clock(2);
    const w = track(c.wait(500));
    await vi.advanceTimersByTimeAsync(250);
    expect(w.done).toBe(true);
  });

  it('changes speed in the middle of a wait, keeping the part already waited', async () => {
    const c = clock();
    const w = track(c.wait(1000));
    await vi.advanceTimersByTimeAsync(500);
    c.setSpeed(4);
    // 500 ms of clock time left at 4x: 125 ms.
    await vi.advanceTimersByTimeAsync(124);
    expect(w.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.done).toBe(true);
  });

  it('stands still while paused and carries on from where it was', async () => {
    const c = clock();
    const w = track(c.wait(1000));
    await vi.advanceTimersByTimeAsync(400);
    c.pause();
    expect(c.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.done).toBe(false);
    expect(c.now()).toBe(400);
    c.resume();
    await vi.advanceTimersByTimeAsync(599);
    expect(w.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.done).toBe(true);
  });

  it('starts a wait made while paused only on resume', async () => {
    const c = clock();
    c.pause();
    const w = track(c.wait(100));
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.done).toBe(false);
    c.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(w.done).toBe(true);
  });

  it('untilRunning resolves at once while running and on resume while paused', async () => {
    const c = clock();
    const running = track(c.untilRunning());
    await vi.advanceTimersByTimeAsync(0);
    expect(running.done).toBe(true);
    c.pause();
    const paused = track(c.untilRunning());
    await vi.advanceTimersByTimeAsync(1000);
    expect(paused.done).toBe(false);
    c.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(paused.done).toBe(true);
  });

  it('cancel rejects every pending wait and every later one with DemoAborted', async () => {
    const c = clock();
    const w = track(c.wait(1000));
    c.pause();
    const r = track(c.untilRunning());
    c.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.error).toBeInstanceOf(DemoAborted);
    expect(r.error).toBeInstanceOf(DemoAborted);
    await expect(c.wait(10)).rejects.toBeInstanceOf(DemoAborted);
    expect(() => c.check()).toThrow(DemoAborted);
    expect(isDemoAborted(w.error)).toBe(true);
    expect(isDemoAborted(new Error('x'))).toBe(false);
  });

  it('a cancelled run unwinds through its awaits', async () => {
    const c = clock();
    const steps: string[] = [];
    const run = (async () => {
      await c.wait(100);
      steps.push('one');
      await c.wait(100);
      steps.push('two');
    })();
    const result = track(run);
    await vi.advanceTimersByTimeAsync(150);
    c.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(steps).toEqual(['one']);
    expect(result.error).toBeInstanceOf(DemoAborted);
  });

  it('animate reports progress from 0 to 1 over clock time and holds while paused', async () => {
    const c = clock(2);
    const seen: number[] = [];
    const done = track(c.animate(400, (t) => seen.push(t)));
    expect(seen[0]).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    const mid = seen[seen.length - 1];
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    c.pause();
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen[seen.length - 1]).toBeLessThan(0.7);
    c.resume();
    await vi.advanceTimersByTimeAsync(200);
    expect(done.done).toBe(true);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('ignores a speed that is not a positive number', async () => {
    const c = clock();
    c.setSpeed(0);
    expect(c.speed).toBe(1);
    c.setSpeed(Number.NaN);
    expect(c.speed).toBe(1);
  });
});
