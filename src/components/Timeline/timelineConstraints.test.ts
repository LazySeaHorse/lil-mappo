import {
  constrainEndTrim,
  constrainGroupMove,
  constrainGroupTrim,
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

  describe('moving several clips together', () => {
    const free = (startTime: number, endTime: number) => ({ startTime, endTime, blockedRanges: [] });

    it('moves them by the proposed offset when nothing is in the way', () => {
      expect(constrainGroupMove(2, [free(1, 3), free(5, 6)], 12)).toBe(2);
    });

    it('stops when the earliest clip reaches the start or the latest reaches the end', () => {
      expect(constrainGroupMove(-4, [free(1, 3), free(5, 6)], 12)).toBe(-1);
      expect(constrainGroupMove(9, [free(1, 3), free(5, 6)], 12)).toBe(6);
    });

    it('finds nothing when the clips together are longer than the video', () => {
      expect(constrainGroupMove(0, [free(0, 6), free(8, 14)], 12)).toBeNull();
      expect(constrainGroupMove(0, [], 12)).toBeNull();
    });

    it('keeps a clip out of its blocked ranges by moving the group to the nearest gap', () => {
      const clips = [{ startTime: 0, endTime: 2, blockedRanges: [{ startTime: 4, endTime: 6 }] }, free(3, 4)];
      // Offset 3 would put the first clip on 3..5, inside 4..6; the legal offsets are up to 2 or from 6.
      expect(constrainGroupMove(3, clips, 12)).toBe(2);
      expect(constrainGroupMove(5, clips, 12)).toBe(6);
    });

    it('agrees with the single-clip move', () => {
      expect(constrainGroupMove(3, [{ startTime: 0, endTime: 2, blockedRanges: blocked }], 12)).toBe(4);
    });
  });

  describe('trimming the same edge of several clips', () => {
    const free = (startTime: number, endTime: number) => ({ startTime, endTime, blockedRanges: [] });

    it('moves every clip by the proposed amount when all of them allow it', () => {
      expect(constrainGroupTrim('end', 1, [free(0, 3), free(4, 8)], 0.2, 12)).toBe(1);
      expect(constrainGroupTrim('start', -1, [free(2, 5), free(4, 8)], 0.2, 12)).toBe(-1);
    });

    it('holds the whole group back at the clip that cannot go further', () => {
      // The second clip is only 1 s long, so its start can move 0.8 s later at most.
      expect(constrainGroupTrim('start', 2, [free(0, 5), free(6, 7)], 0.2, 12)).toBeCloseTo(0.8);
      // The first clip starts at 1 s, so no start can move more than 1 s earlier.
      expect(constrainGroupTrim('start', -3, [free(1, 5), free(6, 9)], 0.2, 12)).toBe(-1);
      // The second clip ends at 11 s, so no end can move more than 1 s later.
      expect(constrainGroupTrim('end', 3, [free(0, 4), free(6, 11)], 0.2, 12)).toBe(1);
    });

    it('stops a clip at its blocked range', () => {
      const clips = [free(0, 5), { startTime: 5, endTime: 7, blockedRanges: [{ startTime: 8, endTime: 10 }] }];
      expect(constrainGroupTrim('end', 2, clips, 0.2, 12)).toBe(1);
    });

    it('finds nothing without clips, or when a clip is stuck inside a blocked range', () => {
      expect(constrainGroupTrim('end', 1, [], 0.2, 12)).toBeNull();
      expect(constrainGroupTrim('start', 1, [{ startTime: 3, endTime: 6, blockedRanges: [{ startTime: 5, endTime: 7 }] }], 0.2, 12)).toBeNull();
    });
  });
});
