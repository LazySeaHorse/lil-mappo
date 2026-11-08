import { describe, expect, it } from 'vitest';
import { mergeValues } from './mergeValues';

describe('mergeValues', () => {
  it('finds no mixed fields when every object agrees', () => {
    const { value, mixed } = mergeValues([{ color: '#fff', width: 2 }, { color: '#fff', width: 2 }]);
    expect(value).toEqual({ color: '#fff', width: 2 });
    expect(mixed.size).toBe(0);
  });

  it('marks a field that differs in any object, and shows the first value', () => {
    const { value, mixed } = mergeValues([
      { color: '#fff', width: 2 },
      { color: '#fff', width: 2 },
      { color: '#000', width: 2 },
    ]);
    expect(value.color).toBe('#fff');
    expect([...mixed]).toEqual(['color']);
  });

  it('compares arrays and objects by what they hold', () => {
    expect(mergeValues([{ dash: [8, 4] }, { dash: [8, 4] }]).mixed.size).toBe(0);
    expect([...mergeValues([{ dash: [8, 4] }, { dash: [2, 4] }]).mixed]).toEqual(['dash']);
    expect([...mergeValues([{ dash: [8, 4] as number[] | null }, { dash: null }]).mixed]).toEqual(['dash']);
  });

  it('marks a field only some of the objects have', () => {
    const merged = mergeValues<Record<string, unknown>>([{ a: 1 }, { a: 1, b: 2 }]);
    expect([...merged.mixed]).toEqual(['b']);
  });

  it('handles nothing to merge', () => {
    expect(mergeValues<{ a: number }>([]).mixed.size).toBe(0);
  });
});
