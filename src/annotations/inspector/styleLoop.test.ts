import { describe, expect, it } from 'vitest';
import { loopTime } from './styleLoop';

describe('loopTime', () => {
  const timing = { end: 3, cycle: 3.5 };

  it('walks through the callout, then rests on an empty beat', () => {
    expect(loopTime(0, timing)).toBe(0);
    expect(loopTime(2.5, timing)).toBe(2.5);
    expect(loopTime(3, timing)).toBe(3);
    expect(loopTime(3.2, timing)).toBeNull();
  });

  it('starts again after each cycle', () => {
    expect(loopTime(3.5, timing)).toBe(0);
    expect(loopTime(8, timing)).toBeCloseTo(1);
  });
});
