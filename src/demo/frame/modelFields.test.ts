import { describe, expect, it } from 'vitest';
import { createModelItem } from '@/store/itemFactories';
import { releaseHeldModels, relinkedModelFile } from './session';
import { MODEL_FIELDS, modelEdits } from './modelFields';

const make = (patch: Record<string, unknown> = {}) => ({
  ...createModelItem({ assetId: 'a', name: 'Tower', position: [2, 48], startTime: 0 }),
  id: 'm',
  ...patch,
});

describe('modelEdits', () => {
  it('lists the differing fields in screen order, leaving the asset to the app’s import', () => {
    const base = make({ assetId: 'generated' });
    const target = make({ name: 'Eiffel', heading: 90, altitude: 20, scale: 3, startTime: 2, endTime: 8, transition: { ...base.transition, enter: 'rise' } });
    expect(modelEdits(base, target).map((e) => e.path)).toEqual([
      'name',
      'altitude',
      'heading',
      'scale',
      'startTime',
      'endTime',
      'transition.enter',
    ]);
  });

  it('moves the end first when the new start is at or past the current end', () => {
    const base = make({ startTime: 0, endTime: 5 });
    const target = make({ startTime: 8, endTime: 12 });
    expect(modelEdits(base, target).map((e) => e.path)).toEqual(['endTime', 'startTime']);
  });

  it('shows an animation duration only while the animation is not none', () => {
    const none = make({ transition: { enter: 'none', exit: 'fade', enterDuration: 0.5, exitDuration: 0.5 } });
    expect(MODEL_FIELDS.fields['transition.enterDuration'].shown!(none, none)).toBe(false);
    expect(MODEL_FIELDS.fields['transition.exitDuration'].shown!(none, none)).toBe(true);
  });
});

describe('relinkedModelFile', () => {
  it('has nothing for a model that was not relinked', () => {
    releaseHeldModels();
    expect(relinkedModelFile('nope')).toBeUndefined();
  });
});
