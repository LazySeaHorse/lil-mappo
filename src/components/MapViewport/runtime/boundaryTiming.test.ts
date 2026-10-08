import { describe, expect, it } from 'vitest';
import type { BoundaryItem } from '@/store/types';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import { resolveBoundaryTiming } from './boundaryTiming';

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
    expect(timing(style, 'none', 10).fillFactor).toBeCloseTo(1);
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
