import { describe, expect, it } from 'vitest';
import type { BoundaryItem } from '@/store/types';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import type { EasingName } from '@/store/types';
import { progressWithin, resolveBoundaryTiming } from './boundaryTiming';

const EASINGS: EasingName[] = [
  'linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'easeInOutSine', 'bounce',
];

function timing(
  style: Partial<BoundaryItem['style']>,
  exitAnimation: BoundaryItem['exitAnimation'],
  time: number,
) {
  return resolveBoundaryTiming(
    { startTime: 0, endTime: 10, easing: 'linear', exitAnimation, style: { ...DEFAULT_BOUNDARY_STYLE, ...style } },
    time,
  );
}

describe('resolveBoundaryTiming fillFactor', () => {
  it('is a step when the outline is not animated', () => {
    expect(timing({ animateStroke: false }, 'none', -1).fillFactor).toBe(0);
    expect(timing({ animateStroke: false }, 'none', 0.01).fillFactor).toBe(1);
  });

  it('follows progress for the fade style', () => {
    const t = timing({ animateStroke: true, animationStyle: 'fade' }, 'none', 5);
    expect(t.progress).toBeCloseTo(0.5);
    expect(t.fillFactor).toBeCloseTo(0.5);
  });

  it('fills only in the last 30% of a drawn outline', () => {
    const style = { animateStroke: true, animationStyle: 'draw' } as const;
    expect(timing(style, 'none', 7).fillFactor).toBe(0);
    expect(timing(style, 'none', 8.5).fillFactor).toBeCloseTo(0.5);
    expect(timing(style, 'none', 10).fillFactor).toBe(1);
  });

  it.each(['draw', 'trace'] as const)('lands exactly on 1 at the end and after it for %s', (animationStyle) => {
    const style = { animateStroke: true, animationStyle };
    for (const time of [10, 10.0001, 20]) expect(timing(style, 'none', time).fillFactor, `t=${time}`).toBe(1);
  });

  it('lands exactly on 1 for every easing at the end of a drawn outline', () => {
    for (const easing of EASINGS) {
      const t = resolveBoundaryTiming(
        { startTime: 0, endTime: 10, easing, exitAnimation: 'none', style: { ...DEFAULT_BOUNDARY_STYLE, animateStroke: true, animationStyle: 'draw' } },
        10,
      );
      expect(t.fillFactor, easing).toBe(1);
    }
  });

  it('starts the reverse exit of a drawn outline exactly on 1, and ends it on 0', () => {
    const draw = { animateStroke: true, animationStyle: 'draw' } as const;
    expect(timing(draw, 'reverse', 10.0000001).fillFactor).toBeLessThanOrEqual(1);
    expect(timing(draw, 'reverse', 10.0000001).fillFactor).toBeCloseTo(1);
    expect(timing(draw, 'reverse', 11).fillFactor).toBe(0);
  });

  it('keeps fillFactor within [0, 1] across progress, easings, styles and exits', () => {
    const styles = [
      { animateStroke: false },
      { animateStroke: true, animationStyle: 'fade' },
      { animateStroke: true, animationStyle: 'draw' },
      { animateStroke: true, animationStyle: 'trace' },
    ] as const;
    for (const easing of EASINGS) {
      for (const style of styles) {
        for (const exitAnimation of ['none', 'fade', 'reverse'] as const) {
          for (let i = -2; i <= 130; i++) {
            const time = i / 10 + (i % 3) * 1e-9;
            const { fillFactor } = resolveBoundaryTiming(
              { startTime: 0, endTime: 10, easing, exitAnimation, style: { ...DEFAULT_BOUNDARY_STYLE, ...style } },
              time,
            );
            expect(fillFactor, `${easing} ${JSON.stringify(style)} ${exitAnimation} t=${time}`).toBeGreaterThanOrEqual(0);
            expect(fillFactor, `${easing} ${JSON.stringify(style)} ${exitAnimation} t=${time}`).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('fades out over the exit duration with a fade exit', () => {
    const style = { animateStroke: false } as const;
    const t = timing(style, 'fade', 10.25);
    expect(t.fadeExit).toBe(true);
    expect(t.exitProgress).toBeCloseTo(0.5);
    expect(t.fillFactor).toBeCloseTo(0.5);
    expect(timing(style, 'fade', 11).fillFactor).toBe(0);
  });

  it('reverse exit un-draws; for draw it only erases the fill in the first 30% of the reverse', () => {
    expect(timing({ animateStroke: false }, 'reverse', 10.25).fillFactor).toBeCloseTo(0.5);
    const draw = { animateStroke: true, animationStyle: 'draw' } as const;
    expect(timing(draw, 'reverse', 10.1).fillFactor).toBeCloseTo((0.8 - 0.7) / 0.3);
    expect(timing(draw, 'reverse', 10.25).fillFactor).toBe(0);
  });

  it('holds after the end when there is no exit animation', () => {
    const t = timing({ animateStroke: false }, 'none', 20);
    expect(t.fillFactor).toBe(1);
    expect(t.fadeExit).toBe(false);
  });
});

describe('progressWithin', () => {
  it('maps the sub-range onto 0-1 and clamps outside it', () => {
    expect(progressWithin(0.5, 0.5, 1)).toBe(0);
    expect(progressWithin(0.2, 0.5, 1)).toBe(0);
    expect(progressWithin(0.75, 0.5, 1)).toBeCloseTo(0.5);
    expect(progressWithin(1.5, 0.5, 1)).toBe(1);
  });

  it('is exactly 1 at the end of the range, whatever the start (no float residue)', () => {
    for (const start of [0.1, 0.3, 0.7, 0.9]) expect(progressWithin(1, start), `start=${start}`).toBe(1);
    expect(progressWithin(0.9, 0.3, 0.9)).toBe(1);
  });

  it('defaults the end to 1 and steps at an empty range', () => {
    expect(progressWithin(0.85, 0.7)).toBeCloseTo(0.5);
    expect(progressWithin(0.4, 0.5, 0.5)).toBe(0);
    expect(progressWithin(0.5, 0.5, 0.5)).toBe(1);
  });
});
