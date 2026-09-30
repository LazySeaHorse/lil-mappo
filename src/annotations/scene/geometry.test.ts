import { describe, it, expect } from 'vitest';
import { arcPoints, roundedRectPoints, pointAtLength, polylineLength, trimPolyline, type Point } from './geometry';

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

describe('arcPoints', () => {
  it('runs along the circle from start to end angle', () => {
    const points = arcPoints(10, 20, 5, 0, Math.PI, 4);
    expect(points).toHaveLength(5);
    expect(points[0][0]).toBeCloseTo(15);
    expect(points[0][1]).toBeCloseTo(20);
    expect(points[4][0]).toBeCloseTo(5);
    for (const [x, y] of points) expect(Math.hypot(x - 10, y - 20)).toBeCloseTo(5);
  });
});

describe('roundedRectPoints', () => {
  it('is the four corners without a radius', () => {
    expect(roundedRectPoints(0, 0, 10, 6)).toEqual([[0, 0], [10, 0], [10, 6], [0, 6]]);
  });

  it('stays within the rectangle and is shorter than its square outline when rounded', () => {
    const points = roundedRectPoints(0, 0, 40, 20, 6);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(40 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(20 + 1e-9);
    }
    expect(polylineLength(points, true)).toBeLessThan(120);
    expect(polylineLength(points, true)).toBeGreaterThan(109);
  });

  it('caps the radius at half the shorter side', () => {
    const points = roundedRectPoints(0, 0, 40, 10, 100);
    expect(Math.min(...points.map((p) => p[1]))).toBeCloseTo(0);
    expect(Math.max(...points.map((p) => p[1]))).toBeCloseTo(10);
  });
});
