import { DEFAULT_TIMING } from '../protocol';
import type { DemoContext } from './actions';
import { DemoClock } from './clock';
import { CursorController } from './cursor';

/** A driver context for tests: real timers, the clock so fast that beats take a moment. */
export function testContext(speed = 1000): DemoContext {
  return {
    clock: new DemoClock({ speed }),
    cursor: new CursorController({ x: 0, y: 0 }),
    timing: DEFAULT_TIMING,
  };
}
