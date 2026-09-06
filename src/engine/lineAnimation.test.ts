import { describe, expect, it } from 'vitest';
import { getAnimatedLine, getLineSegment } from './lineAnimation';

describe('engine/lineAnimation', () => {
  const straightLine = [
    [0, 0],
    [10, 0],
  ];

  const multiSegmentLine = [
    [0, 0],
    [10, 0],
    [10, 10],
    [20, 10],
  ];

  const coords3D = [
    [0, 0, 100],
    [10, 0, 500],
    [20, 0, 1000],
  ];

  it('returns start coordinate pair at progress 0 with length >= 2', () => {
    const anim = getAnimatedLine(straightLine, 0);
    expect(anim).toHaveLength(2);
    expect(anim[0]).toEqual([0, 0]);
    expect(anim[1]).toEqual([0, 0]);
  });

  it('returns full line at progress 1', () => {
    const anim = getAnimatedLine(multiSegmentLine, 1);
    expect(anim.length).toBeGreaterThanOrEqual(4);
    expect(anim[0]).toEqual([0, 0]);
    expect(anim[anim.length - 1][0]).toBeCloseTo(20, 4);
    expect(anim[anim.length - 1][1]).toBeCloseTo(10, 4);
  });

  it('returns interpolated point at progress 0.5', () => {
    const anim = getAnimatedLine(straightLine, 0.5);
    expect(anim.length).toBeGreaterThanOrEqual(2);
    expect(anim[0]).toEqual([0, 0]);
    expect(anim[anim.length - 1][0]).toBeCloseTo(5, 1);
    expect(anim[anim.length - 1][1]).toBeCloseTo(0, 1);
  });

  it('getLineSegment returns point pair when startT === endT', () => {
    const seg0 = getLineSegment(straightLine, 0, 0);
    expect(seg0).toHaveLength(2);
    expect(seg0[0]).toEqual([0, 0]);
    expect(seg0[1]).toEqual([0, 0]);

    const seg1 = getLineSegment(straightLine, 1, 1);
    expect(seg1).toHaveLength(2);
    expect(seg1[0]).toEqual([10, 0]);
    expect(seg1[1]).toEqual([10, 0]);

    const segMid = getLineSegment(straightLine, 0.5, 0.5);
    expect(segMid).toHaveLength(2);
    expect(segMid[0][0]).toBeCloseTo(5, 1);
    expect(segMid[0][1]).toBeCloseTo(0, 1);
    expect(segMid[1][0]).toBeCloseTo(5, 1);
    expect(segMid[1][1]).toBeCloseTo(0, 1);
  });

  it('getLineSegment returns empty array when startT > endT', () => {
    const seg = getLineSegment(straightLine, 0.8, 0.2);
    expect(seg).toEqual([]);
  });

  it('getLineSegment extracts sub-segment accurately', () => {
    const seg = getLineSegment(straightLine, 0.25, 0.75);
    expect(seg.length).toBeGreaterThanOrEqual(2);
    expect(seg[0][0]).toBeCloseTo(2.5, 1);
    expect(seg[seg.length - 1][0]).toBeCloseTo(7.5, 1);
  });

  it('handles 3D coordinates interpolating altitude', () => {
    const seg = getAnimatedLine(coords3D, 0.5);
    expect(seg.length).toBeGreaterThanOrEqual(2);
    const last = seg[seg.length - 1];
    expect(last[0]).toBeCloseTo(10, 1);
    expect(last[2]).toBeCloseTo(500, 1);
  });

  it('handles single-point or empty coordinates safely', () => {
    expect(getLineSegment([[5, 5]], 0, 1)).toEqual([[5, 5]]);
    expect(getLineSegment([], 0, 1)).toEqual([]);
  });
});
