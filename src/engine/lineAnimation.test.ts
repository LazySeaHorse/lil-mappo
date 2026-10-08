import { describe, expect, it } from 'vitest';
import length from '@turf/length';
import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';
import { getAnimatedLine, getLineSegment } from './lineAnimation';
import { lngLatToMerc, mercToLngLat } from './cameraPose';

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

/** Straight in mercator, as Mapbox draws a segment, with longitude taken the short way round. */
function interp(a: number[], b: number[], f: number): number[] {
  const bLng = b[0] + 360 * Math.round((a[0] - b[0]) / 360);
  const [ax, ay] = lngLatToMerc(a[0], a[1]);
  const by = lngLatToMerc(bLng, b[1])[1];
  const x = a[0] + f * (bLng - a[0]);
  const y = mercToLngLat(ax, ay + f * (by - ay))[1];
  if (a[2] !== undefined && b[2] !== undefined) return [x, y, a[2] + f * (b[2] - a[2])];
  return [x, y];
}

/** Reference: the original per-call algorithm. */
function referenceSegment(full: number[][], startT: number, endT: number): number[][] {
  if (full.length < 2) return full;
  const t1 = Math.max(0, Math.min(1, startT));
  const t2 = Math.max(0, Math.min(1, endT));
  if (t1 > t2) return [];
  const total = length(lineString(full), { units: 'kilometers' });
  if (total === 0) return [full[0], full[0]];
  const sd = t1 * total;
  const ed = t2 * total;
  let acc = 0;
  const out: number[][] = [];
  let started = false;
  for (let i = 1; i < full.length; i++) {
    const segLen = distance(point(full[i - 1]), point(full[i]), { units: 'kilometers' });
    const s0 = acc;
    const s1 = acc + segLen;
    if (s1 >= sd && s0 <= ed) {
      const f0 = segLen > 0 ? (sd - s0) / segLen : 0;
      const f1 = segLen > 0 ? (ed - s0) / segLen : 0;
      const first = s0 < sd ? interp(full[i - 1], full[i], f0) : full[i - 1];
      const last = s1 > ed ? interp(full[i - 1], full[i], f1) : full[i];
      if (!started) { out.push(first); started = true; }
      out.push(last);
      if (s1 >= ed) break;
    }
    acc += segLen;
  }
  if (out.length === 0) {
    const c = t1 >= 1 ? full[full.length - 1] : full[0];
    return [c, c];
  }
  if (out.length === 1) return [out[0], out[0]];
  return out;
}

// Zero-length segments may or may not repeat a vertex at the start of a slice; the drawn line is the same.
function dedupe(line: number[][]): number[][] {
  const out = line.filter((c, i) => i === 0 || c.some((v, k) => v !== line[i - 1][k]));
  return out.length === 1 ? [out[0], out[0]] : out;
}

describe('engine/lineAnimation cumulative table parity', () => {
  const routes: Record<string, number[][]> = {
    zigzag: [[-122.4, 37.7], [-121.9, 38.1], [-120.5, 37.2], [-119.0, 39.0], [-118.2, 34.0]],
    zeroLenSegments: [[0, 0], [0, 0], [5, 5], [5, 5], [5, 5], [9, 1], [9, 1]],
    threeD: [[0, 0, 10], [3, 4, 200], [3, 4, 300], [8, 1, 50], [20, 20, 1000]],
    antimeridian: [[170, 10], [179, 12], [-179, 14], [-170, 16]],
    allSame: [[1, 1], [1, 1], [1, 1]],
  };
  const ts = [-0.5, 0, 0.001, 0.1, 0.25, 0.5, 0.5000001, 0.75, 0.999, 1, 1.5];

  for (const [name, coords] of Object.entries(routes)) {
    it(`matches reference for ${name}`, () => {
      for (const a of ts) {
        for (const b of ts) {
          const got = dedupe(getLineSegment(coords, a, b));
          const want = dedupe(referenceSegment(coords, a, b));
          expect(got).toHaveLength(want.length);
          got.forEach((c, i) => {
            expect(c).toHaveLength(want[i].length);
            c.forEach((v, k) => expect(v).toBeCloseTo(want[i][k], 9));
          });
        }
      }
    });
  }

  it('handles short inputs', () => {
    expect(getLineSegment([], 0, 1)).toEqual([]);
    expect(getLineSegment([[1, 2]], 0, 1)).toEqual([[1, 2]]);
  });
});
