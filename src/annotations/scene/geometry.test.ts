import { describe, it, expect } from 'vitest';
import { pointAtLength, polylineLength, trimPolyline, type Point } from './geometry';

const ELBOW: Point[] = [[0, 0], [30, 40], [80, 40]]; // 50 + 50 = 100 long
const SQUARE: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe('polylineLength', () => {
  it('sums segment lengths', () => {
    expect(polylineLength(ELBOW)).toBeCloseTo(100);
  });

  it('includes the closing segment for closed shapes', () => {
    expect(polylineLength(SQUARE)).toBe(30);
    expect(polylineLength(SQUARE, true)).toBe(40);
  });

  it('is zero for fewer than two points', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([[5, 5]])).toBe(0);
  });
});

describe('pointAtLength', () => {
  it('interpolates within a segment', () => {
    expect(pointAtLength(ELBOW, 25)).toEqual([15, 20]);
  });

  it('passes through vertices and follows the next segment', () => {
    expect(pointAtLength(ELBOW, 50)).toEqual([30, 40]);
    expect(pointAtLength(ELBOW, 75)).toEqual([55, 40]);
  });

  it('clamps to the ends', () => {
    expect(pointAtLength(ELBOW, -5)).toEqual([0, 0]);
    expect(pointAtLength(ELBOW, 500)).toEqual([80, 40]);
  });

  it('walks the closing segment of a closed shape', () => {
    expect(pointAtLength(SQUARE, 35, true)).toEqual([0, 5]);
  });

  it('skips zero-length segments', () => {
    expect(pointAtLength([[0, 0], [0, 0], [10, 0]], 5)).toEqual([5, 0]);
  });
});

describe('trimPolyline', () => {
  it('returns the whole line for the full range', () => {
    expect(trimPolyline(ELBOW, 0, 1)).toEqual(ELBOW);
  });

  it('returns nothing for an empty range', () => {
    expect(trimPolyline(ELBOW, 0, 0)).toEqual([]);
    expect(trimPolyline(ELBOW, 0.6, 0.4)).toEqual([]);
    expect(trimPolyline([[1, 1]], 0, 1)).toEqual([]);
  });

  it('cuts inside the first segment', () => {
    expect(trimPolyline(ELBOW, 0, 0.25)).toEqual([[0, 0], [15, 20]]);
  });

  it('keeps interior vertices that fall inside the range', () => {
    expect(trimPolyline(ELBOW, 0, 0.75)).toEqual([[0, 0], [30, 40], [55, 40]]);
  });

  it('trims a middle window from both ends', () => {
    expect(trimPolyline(ELBOW, 0.25, 0.75)).toEqual([[15, 20], [30, 40], [55, 40]]);
  });

  it('has the requested fraction of the original length', () => {
    for (const fraction of [0.1, 0.5, 0.9]) {
      expect(polylineLength(trimPolyline(ELBOW, 0, fraction))).toBeCloseTo(100 * fraction);
    }
  });

  it('clamps fractions outside 0–1', () => {
    expect(trimPolyline(ELBOW, -1, 2)).toEqual(ELBOW);
  });

  it('trims closed shapes along the closing segment', () => {
    const trimmed = trimPolyline(SQUARE, 0, 1, true);
    expect(trimmed).toEqual([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
    expect(polylineLength(trimPolyline(SQUARE, 0, 0.9, true))).toBeCloseTo(36);
  });
});
