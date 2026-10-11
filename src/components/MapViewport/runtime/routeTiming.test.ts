import { describe, expect, it } from 'vitest';
import { getNormalizedProgress } from '@/engine/easings';
import type { RouteItem } from '@/store/types';
import { routeTiming } from './routeTiming';

type Exit = RouteItem['exitAnimation'];

const route = (exitAnimation: Exit) =>
  ({ startTime: 2, endTime: 10, easing: 'easeInOutCubic', exitAnimation }) as Pick<
    RouteItem,
    'startTime' | 'endTime' | 'easing' | 'exitAnimation'
  >;

// The three copies RouteRenderer used to compute inline, kept as the oracle.
function legacy(r: ReturnType<typeof route>, t: number) {
  const isBeforeStart = t < r.startTime;
  const exitActive = r.exitAnimation !== 'none' && t > r.endTime;
  const exitProgress = exitActive ? Math.min((t - r.endTime) / 0.5, 1) : 0;
  const lineOpacity = r.exitAnimation !== 'fade' || t <= r.endTime ? 1 : 1 - Math.min((t - r.endTime) / 0.5, 1);
  const vehicleExitActive = t > r.endTime && r.exitAnimation !== 'none';
  const vehicleExitProgress = vehicleExitActive ? Math.min((t - r.endTime) / 0.5, 1) : 0;
  const vehicleOpacity = r.exitAnimation === 'fade' && vehicleExitActive ? 1 - vehicleExitProgress : 1;
  return { isBeforeStart, exitActive, exitProgress, isAfterExit: exitProgress >= 1, lineOpacity, vehicleExitProgress, vehicleOpacity };
}

describe('routeTiming', () => {
  const exits: Exit[] = ['none', 'fade', 'reverse'];
  const times = [-1, 1.99, 2, 4.5, 9.999, 10, 10.0001, 10.2, 10.25, 10.5, 10.6, 30];

  it.each(exits)('matches the renderer\'s former inline timing (exit %s)', (exit) => {
    const r = route(exit);
    for (const t of times) {
      const timing = routeTiming(r, t);
      const old = legacy(r, t);
      expect(timing.progress, `t=${t}`).toBe(getNormalizedProgress(t, r.startTime, r.endTime, r.easing));
      expect(timing.isBeforeStart, `t=${t}`).toBe(old.isBeforeStart);
      expect(timing.exitActive, `t=${t}`).toBe(old.exitActive);
      expect(timing.exitProgress, `t=${t}`).toBe(old.exitProgress);
      expect(timing.exitProgress, `t=${t}`).toBe(old.vehicleExitProgress);
      expect(timing.isAfterExit, `t=${t}`).toBe(old.isAfterExit);
      expect(timing.opacity, `t=${t}`).toBe(old.lineOpacity);
      expect(timing.opacity, `t=${t}`).toBe(old.vehicleOpacity);
    }
  });

  it('keeps a route without an exit animation on screen, like none', () => {
    expect(routeTiming(route(undefined), 10.5)).toMatchObject({ exitActive: false, exitProgress: 0, isAfterExit: false, opacity: 1 });
  });

  it('fades out over half a second', () => {
    expect(routeTiming(route('fade'), 10.25).opacity).toBeCloseTo(0.5);
    expect(routeTiming(route('fade'), 10.5)).toMatchObject({ opacity: 0, isAfterExit: true });
    expect(routeTiming(route('none'), 50)).toMatchObject({ exitActive: false, exitProgress: 0, isAfterExit: false, opacity: 1 });
  });
});
