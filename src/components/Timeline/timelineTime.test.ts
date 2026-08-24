import { describe, expect, it } from 'vitest';
import { formatTimelineTime } from './timelineTime';

describe('formatTimelineTime', () => {
  it.each([
    [0, '00:00.00'],
    [5.2, '00:05.20'],
    [59.99, '00:59.99'],
    [60, '01:00.00'],
    [125.349, '02:05.34'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatTimelineTime(seconds)).toBe(expected);
  });
});
