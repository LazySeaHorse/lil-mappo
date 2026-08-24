import {
  constrainEndTrim,
  constrainMove,
  constrainStartTrim,
  type TimeRange,
} from './timelineConstraints';

const blocked: TimeRange[] = [
  { startTime: 2, endTime: 4 },
  { startTime: 8, endTime: 10 },
];

describe('timeline auto-camera constraints', () => {
  it('stops a start trim at the end of the preceding block', () => {
    expect(constrainStartTrim(3, 7, blocked, 0.2)).toBe(4);
    expect(constrainStartTrim(5, 7, blocked, 0.2)).toBe(5);
  });

  it('stops an end trim at the start of the following block', () => {
    expect(constrainEndTrim(5, 9, blocked, 0.2, 12)).toBe(8);
    expect(constrainEndTrim(5, 7, blocked, 0.2, 12)).toBe(7);
  });

  it('moves a range to the nearest complete gap without changing its duration', () => {
    expect(constrainMove(3, 2, blocked, 12)).toEqual({ startTime: 4, endTime: 6 });
    expect(constrainMove(7, 2, blocked, 12)).toEqual({ startTime: 6, endTime: 8 });
  });

  it('handles several adjacent blocks without leaving a remaining overlap', () => {
    const severalBlocks = [
      { startTime: 2, endTime: 4 },
      { startTime: 4, endTime: 6 },
      { startTime: 6, endTime: 8 },
    ];

    expect(constrainMove(4, 2, severalBlocks, 12)).toEqual({ startTime: 0, endTime: 2 });
  });

  it('returns null when no complete gap exists', () => {
    expect(constrainMove(1, 3, [{ startTime: 0, endTime: 10 }], 10)).toBeNull();
  });
});
