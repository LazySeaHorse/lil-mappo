import { describe, expect, it } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import { modelTiming } from './timingAdapters';

const item = { ...createModelItem({ assetId: 'a', name: 'A', position: [0, 0], startTime: 2 }), endTime: 6 };

describe('modelTiming', () => {
  it('reads the span and the appear and disappear animations, with no motion or end behaviour', () => {
    const model = modelTiming.read(item);
    expect(model).toMatchObject({ start: 2, length: 4, end: 6, transition: item.transition });
    expect(model.easing).toBeUndefined();
    expect(model.whenItEnds).toBeUndefined();
  });

  it('writes times and merges animation changes', () => {
    expect(modelTiming.write(item, { start: 3 })).toEqual({ startTime: 3, endTime: 7 });
    expect(modelTiming.write(item, { transition: { enter: 'rise' } })).toEqual({
      transition: { ...item.transition, enter: 'rise' },
    });
  });

  it('offers the model animations', () => {
    expect(modelTiming.transitionChoices?.enter).toEqual(['none', 'fade', 'scale-up', 'rise']);
    expect(modelTiming.transitionChoices?.exit).toEqual(['none', 'fade', 'scale-down', 'sink']);
  });
});
