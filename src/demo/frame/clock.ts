/**
 * The demo run's clock. Every beat of a run (cursor travel, typing, holds)
 * waits on it, so one switch pauses, speeds up or stops the whole run.
 *
 * Time on the clock is virtual: it runs `speed` times as fast as real time and
 * stands still while paused. `wait(ms)` waits that many virtual ms. `cancel()`
 * rejects every wait with `DemoAborted`, now and later, so a run unwinds from
 * wherever it is; a new run gets a new clock.
 */

export class DemoAborted extends Error {
  constructor() {
    super('Demo run aborted');
    this.name = 'DemoAborted';
  }
}

export const isDemoAborted = (error: unknown): error is DemoAborted => error instanceof DemoAborted;

interface Waiter {
  /** Virtual time the wait ends at. */
  until: number;
  timer: ReturnType<typeof setTimeout> | null;
  resolve: () => void;
  reject: (error: DemoAborted) => void;
}

/** About one display frame: how often `animate` redraws, in real ms. */
const FRAME_MS = 16;

export interface DemoClockOptions {
  speed?: number;
  /** Real time in ms (tests pass Date.now under fake timers). */
  now?: () => number;
}

export class DemoClock {
  private speedValue: number;
  private pausedValue = false;
  private abortedValue = false;
  private readonly realNow: () => number;
  /** Virtual time at `anchorReal`. */
  private anchorVirtual = 0;
  private anchorReal: number;
  private readonly waiters = new Set<Waiter>();
  /** Resolvers of `untilRunning()` calls waiting for resume. */
  private resumers: Array<() => void> = [];

  constructor({ speed = 1, now = () => performance.now() }: DemoClockOptions = {}) {
    this.speedValue = sanitizeSpeed(speed);
    this.realNow = now;
    this.anchorReal = now();
  }

  get speed(): number {
    return this.speedValue;
  }

  get paused(): boolean {
    return this.pausedValue;
  }

  get aborted(): boolean {
    return this.abortedValue;
  }

  /** Virtual ms since the clock was made. */
  now(): number {
    if (this.pausedValue) return this.anchorVirtual;
    return this.anchorVirtual + (this.realNow() - this.anchorReal) * this.speedValue;
  }

  /** Waits `ms` of clock time. Rejects with DemoAborted once the clock is cancelled. */
  wait(ms: number): Promise<void> {
    if (this.abortedValue) return Promise.reject(new DemoAborted());
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = { until: this.now() + Math.max(0, ms), timer: null, resolve, reject };
      this.waiters.add(waiter);
      this.schedule(waiter);
    });
  }

  /** Resolves at once while running; while paused, on resume. Rejects once cancelled. */
  untilRunning(): Promise<void> {
    if (this.abortedValue) return Promise.reject(new DemoAborted());
    if (!this.pausedValue) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.resumers.push(() => (this.abortedValue ? reject(new DemoAborted()) : resolve()));
    });
  }

  /** Throws DemoAborted when the clock was cancelled; for sync code between waits. */
  check(): void {
    if (this.abortedValue) throw new DemoAborted();
  }

  /**
   * Calls `frame(t)` about once a display frame, t from 0 to 1 over `ms` of clock
   * time; the last call is always t = 1. Pausing holds t where it is.
   */
  async animate(ms: number, frame: (t: number) => void): Promise<void> {
    this.check();
    const start = this.now();
    const length = Math.max(0, ms);
    for (;;) {
      const t = length === 0 ? 1 : Math.min(1, (this.now() - start) / length);
      frame(t);
      if (t >= 1) return;
      await this.realDelay(FRAME_MS);
      await this.untilRunning();
    }
  }

  /** Waits real ms (not scaled by speed), still stopping on cancel. For polling the page. */
  realDelay(ms: number): Promise<void> {
    if (this.abortedValue) return Promise.reject(new DemoAborted());
    return this.wait(ms * this.speedValue);
  }

  pause(): void {
    if (this.pausedValue || this.abortedValue) return;
    this.anchorVirtual = this.now();
    this.anchorReal = this.realNow();
    this.pausedValue = true;
    for (const waiter of this.waiters) this.clearTimer(waiter);
  }

  resume(): void {
    if (!this.pausedValue || this.abortedValue) return;
    this.anchorReal = this.realNow();
    this.pausedValue = false;
    for (const waiter of this.waiters) this.schedule(waiter);
    this.flushResumers();
  }

  setSpeed(speed: number): void {
    if (this.abortedValue) return;
    this.anchorVirtual = this.now();
    this.anchorReal = this.realNow();
    this.speedValue = sanitizeSpeed(speed);
    if (this.pausedValue) return;
    for (const waiter of this.waiters) this.schedule(waiter);
  }

  /** Stops the run: every wait, now and later, rejects with DemoAborted. */
  cancel(): void {
    if (this.abortedValue) return;
    this.abortedValue = true;
    for (const waiter of this.waiters) {
      this.clearTimer(waiter);
      waiter.reject(new DemoAborted());
    }
    this.waiters.clear();
    this.flushResumers();
  }

  private flushResumers(): void {
    const resumers = this.resumers;
    this.resumers = [];
    for (const resume of resumers) resume();
  }

  private clearTimer(waiter: Waiter): void {
    if (waiter.timer !== null) clearTimeout(waiter.timer);
    waiter.timer = null;
  }

  private schedule(waiter: Waiter): void {
    this.clearTimer(waiter);
    if (this.pausedValue) return;
    const left = (waiter.until - this.now()) / this.speedValue;
    if (left <= 0) {
      this.waiters.delete(waiter);
      waiter.resolve();
      return;
    }
    // A timer can fire a hair early; schedule() then waits the rest.
    waiter.timer = setTimeout(() => {
      waiter.timer = null;
      this.schedule(waiter);
    }, left);
  }
}

function sanitizeSpeed(speed: number): number {
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}
