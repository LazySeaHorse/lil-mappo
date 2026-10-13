import { describe, expect, it } from 'vitest';
import { formatTimelineTime, parseTimelineTime } from './timelineTime';

describe('formatTimelineTime', () => {
  it.each([
    [0, '00:00.00'],
    [5.2, '00:05.20'],
    [59.99, '00:59.99'],
    [60, '01:00.00'],
    [125.349, '02:05.34'],
    // Binary floats: 2.3 is 2.2999..., 4.35 is 4.3499...
    [2.3, '00:02.30'],
    [4.35, '00:04.35'],
    [7.07, '00:07.07'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatTimelineTime(seconds)).toBe(expected);
  });
});

describe('parseTimelineTime', () => {
  it.each([
    ['2', 2],
    ['2.5', 2.5],
    ['00:05.20', 5.2],
    ['1:05.5', 65.5],
    ['01:00', 60],
    [' 3.25 ', 3.25],
  ])('reads %j as %s seconds', (text, expected) => {
    expect(parseTimelineTime(text)).toBeCloseTo(expected, 5);
  });

  it.each(['', 'abc', '-1', '1:2:3', '1:75', '1,5'])('rejects %j', (text) => {
    expect(parseTimelineTime(text)).toBeNull();
  });

  it('reads back what formatTimelineTime writes', () => {
    for (const value of [0, 0.01, 2.3, 4.35, 59.99, 125.34]) {
      expect(parseTimelineTime(formatTimelineTime(value))).toBeCloseTo(value, 5);
    }
  });
});
