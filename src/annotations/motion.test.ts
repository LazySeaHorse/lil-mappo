import { describe, it, expect } from 'vitest';
import {
  buildProgress,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  easeOutQuad,
  lerp,
  linear,
  stage,
  type Easing,
} from './motion';

const EASINGS: Record<string, Easing> = {
  linear,
  easeOutQuad,
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
};

describe('clamp01 and lerp', () => {
  it('clamps to 0–1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(3)).toBe(1);
  });

  it('interpolates', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(5, -5, 1)).toBe(-5);
  });
});

describe('easing functions', () => {
  it.each(Object.entries(EASINGS))('%s starts at 0 and ends at 1', (_, ease) => {
    expect(ease(0)).toBeCloseTo(0);
    expect(ease(1)).toBeCloseTo(1);
  });

  it('shapes the middle of the curve', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeOutQuad(0.5)).toBeCloseTo(0.75);
    expect(easeInCubic(0.5)).toBeLessThan(0.5);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it('easeOutBack overshoots 1 before settling', () => {
    const peak = Math.max(...Array.from({ length: 100 }, (_, i) => easeOutBack(i / 99)));
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.15);
    expect(easeOutBack(0.7, 3)).toBeGreaterThan(easeOutBack(0.7, 1));
    expect(easeOutBack(0)).toBe(0);
    expect(easeOutBack(1)).toBe(1);
  });
});

describe('stage', () => {
  it('is 0 before the window, 1 after it and linear inside', () => {
    expect(stage(0.1, 0.2, 0.6)).toBe(0);
    expect(stage(0.2, 0.2, 0.6)).toBe(0);
    expect(stage(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(stage(0.6, 0.2, 0.6)).toBe(1);
    expect(stage(1, 0.2, 0.6)).toBe(1);
  });

  it('applies the easing to the windowed progress', () => {
    expect(stage(0.4, 0.2, 0.6, easeOutQuad)).toBeCloseTo(0.75);
  });

  it('lets an overshooting easing exceed 1 inside the window and settle at 1 after it', () => {
    expect(stage(0.4, 0, 0.5, easeOutBack)).toBeGreaterThan(1);
    expect(stage(1, 0, 0.5, easeOutBack)).toBeCloseTo(1);
  });

  it('treats an empty window as a step', () => {
    expect(stage(0.49, 0.5, 0.5)).toBe(0);
    expect(stage(0.5, 0.5, 0.5)).toBe(1);
  });

  it('clamps out-of-range progress', () => {
    expect(stage(-1, 0, 1)).toBe(0);
    expect(stage(2, 0, 1)).toBe(1);
  });

  it('lets overlapping stages run at the same time', () => {
    // At 0.4 the first stage (0.2–0.6) is mid-way while the second (0.3–0.7) has begun.
    expect(stage(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(stage(0.4, 0.3, 0.7)).toBeCloseTo(0.25);
  });
});

describe('buildProgress', () => {
  it('builds up while entering, is complete while visible and reverses while exiting', () => {
    expect(buildProgress('enter', 0.25)).toBe(0.25);
    expect(buildProgress('visible', 1)).toBe(1);
    expect(buildProgress('exit', 0)).toBe(1);
    expect(buildProgress('exit', 0.25)).toBe(0.75);
    expect(buildProgress('exit', 1)).toBe(0);
  });

  it('clamps progress', () => {
    expect(buildProgress('enter', 1.5)).toBe(1);
    expect(buildProgress('exit', -1)).toBe(1);
  });
});
