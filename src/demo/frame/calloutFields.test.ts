import { describe, expect, it } from 'vitest';
import '@/annotations/styles/index';
import { createCalloutItem } from '@/store/itemFactories';
import { calloutEdits, calloutFields } from './calloutFields';

const make = (styleId: string, patch: Record<string, unknown> = {}) => ({
  ...createCalloutItem({ id: 'c', styleId, content: { title: 'Paris' }, lngLat: [2, 48], startTime: 0 })!,
  ...patch,
});

describe('calloutFields', () => {
  it('gives an accented style one Accent color row and folds its other colors away', () => {
    const { table, folded } = calloutFields('leader-line');
    expect(table.fields['settings.accentColor']).toMatchObject({ label: 'Accent color', control: 'color' });
    // The second accent follows the first: no row of its own.
    expect(table.fields['settings.lineColor']).toBeUndefined();
    expect(table.fields['settings.textColor']).toMatchObject({ label: 'Text color' });
    expect(folded.has('settings.textColor')).toBe(true);
    expect(folded.has('settings.accentColor')).toBe(false);
    expect(table.fields['settings.pulse']).toMatchObject({ control: 'switch', label: 'Pulse' });
    expect(table.fields['settings.lineWidth']).toMatchObject({ control: 'slider', label: 'Line width' });
  });

  it('shows a transition duration only while the transition is not none', () => {
    const { table } = calloutFields('leader-line');
    const none = make('leader-line', { transition: { enter: 'none', exit: 'fade', enterDuration: 0.4, exitDuration: 0.3 } });
    expect(table.fields['transition.enterDuration'].shown!(none, none)).toBe(false);
    expect(table.fields['transition.exitDuration'].shown!(none, none)).toBe(true);
  });
});

describe('calloutEdits', () => {
  it('lists the differing fields in screen order, a number as its three rows', () => {
    const base = make('big-number');
    const target = make('big-number', {
      content: { title: 'Eiffel', metric: { value: 330, unit: 'm', label: 'tall' }, subtitle: 'Paris' },
      scale: 2,
      startTime: 3,
      endTime: 8,
      settings: { ...base.settings, prefix: '~' },
    });
    expect(calloutEdits(base, target).map((e) => e.path)).toEqual([
      'content.title',
      'content.subtitle',
      'content.metric.value',
      'content.metric.unit',
      'content.metric.label',
      'settings.prefix',
      'scale',
      'startTime',
      'endTime',
    ]);
  });

  it('moves the end first when the new start is at or past the current end', () => {
    const base = make('leader-line', { startTime: 0, endTime: 5 });
    const target = make('leader-line', { startTime: 8, endTime: 12 });
    expect(calloutEdits(base, target).map((e) => e.path)).toEqual(['endTime', 'startTime']);
  });
});
