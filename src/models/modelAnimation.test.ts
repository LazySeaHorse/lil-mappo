import { describe, expect, it } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import type { ModelItem, ModelTransition } from '@/store/types';
import { modelFrame } from './modelAnimation';

const item = (transition: Partial<ModelTransition>): ModelItem => ({
  ...createModelItem({ assetId: 'a', name: 'A', position: [0, 0], startTime: 10 }),
  endTime: 20,
  transition: { enter: 'fade', exit: 'fade', enterDuration: 1, exitDuration: 2, ...transition },
});

describe('modelFrame', () => {
  it('is hidden outside its time on the timeline', () => {
    expect(modelFrame(item({}), 9.99)).toBeNull();
    expect(modelFrame(item({}), 20.01)).toBeNull();
  });

  it('is fully shown between its appear and disappear animations', () => {
    expect(modelFrame(item({}), 15)).toEqual({ opacity: 1, scale: 1, height: 1 });
  });

  it('fades in and out over their durations', () => {
    expect(modelFrame(item({}), 10.5)!.opacity).toBeCloseTo(0.5);
    expect(modelFrame(item({}), 19)!.opacity).toBeCloseTo(0.5);
  });

  it('pops in from nothing with a small overshoot, and shrinks away', () => {
    const pop = item({ enter: 'scale-up', exit: 'scale-down' });
    expect(modelFrame(pop, 10)!.scale).toBe(0);
    const peak = Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => modelFrame(pop, 10 + t)!.scale));
    expect(peak).toBeGreaterThan(1);
    expect(modelFrame(pop, 11)!.scale).toBe(1);
    expect(modelFrame(pop, 20)!.scale).toBe(0);
    expect(modelFrame(pop, 10.5)!.opacity).toBe(1);
  });

  it('rises out of the ground and sinks back into it', () => {
    const rise = item({ enter: 'rise', exit: 'sink' });
    expect(modelFrame(rise, 10)!.height).toBe(0);
    expect(modelFrame(rise, 10.5)!.height).toBeGreaterThan(0.5);
    expect(modelFrame(rise, 11)!.height).toBe(1);
    expect(modelFrame(rise, 19)!.height).toBeGreaterThan(0);
    expect(modelFrame(rise, 20)!.height).toBe(0);
  });

  it('appears and disappears at once with none', () => {
    const none = item({ enter: 'none', exit: 'none' });
    expect(modelFrame(none, 10)).toEqual({ opacity: 1, scale: 1, height: 1 });
    expect(modelFrame(none, 20)).toEqual({ opacity: 1, scale: 1, height: 1 });
  });

  it('shows a settled model in full whatever the time (editor preview of the selection)', () => {
    expect(modelFrame(item({}), 3, { settled: true })).toEqual({ opacity: 1, scale: 1, height: 1 });
  });

  it('shares a short item between its animations', () => {
    const short = { ...item({ enterDuration: 3, exitDuration: 3 }), endTime: 12 };
    // 2 s long: each animation gets half.
    expect(modelFrame(short, 11)!.opacity).toBeCloseTo(1);
    expect(modelFrame(short, 10.5)!.opacity).toBeCloseTo(0.5);
  });
});
