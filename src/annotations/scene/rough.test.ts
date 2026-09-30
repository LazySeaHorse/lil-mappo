import { describe, it, expect } from 'vitest';
import { polylineLength, type Point } from './geometry';
import { roughArrow, roughCircle, roughEllipse, roughLine, roughRect } from './rough';

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('rough shapes', () => {
  it('are deterministic per seed and differ between seeds', () => {
    expect(roughCircle(0, 0, 40, { seed: 7 })).toEqual(roughCircle(0, 0, 40, { seed: 7 }));
    expect(roughCircle(0, 0, 40, { seed: 7 })).not.toEqual(roughCircle(0, 0, 40, { seed: 8 }));
    expect(roughLine([0, 0], [100, 0], { seed: 2 })).toEqual(roughLine([0, 0], [100, 0], { seed: 2 }));
    expect(roughRect(0, 0, 50, 30, { seed: 2 })).toEqual(roughRect(0, 0, 50, 30, { seed: 2 }));
  });

  it('roughLine wobbles around and slightly past the straight line', () => {
    const points = roughLine([0, 0], [200, 0], { seed: 3 });
    expect(points.length).toBeGreaterThan(4);
    expect(points[0][0]).toBeLessThanOrEqual(0);
    expect(points[points.length - 1][0]).toBeGreaterThan(200);
    expect(points[points.length - 1][0]).toBeLessThan(200 * 1.1);
    expect(points.some((p) => p[1] !== 0)).toBe(true);
    expect(Math.max(...points.map((p) => Math.abs(p[1])))).toBeLessThan(8);
  });

  it('is a clean straight line with no roughness or overshoot', () => {
    const points = roughLine([0, 0], [100, 50], { roughness: 0, overshoot: 0 });
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1][0]).toBeCloseTo(100);
    expect(polylineLength(points)).toBeCloseTo(Math.hypot(100, 50), 5);
  });

  it('roughCircle goes past a full turn and ends off its start, near the radius', () => {
    const points = roughCircle(10, 20, 50, { seed: 4 });
    expect(dist(points[0], points[points.length - 1])).toBeGreaterThan(1);
    expect(polylineLength(points)).toBeGreaterThan(2 * Math.PI * 50);
    for (const p of points) expect(Math.abs(dist(p, [10, 20]) - 50)).toBeLessThan(10);
    // Lands at the top by default.
    expect(points[0][0]).toBeCloseTo(10, 0);
    expect(points[0][1]).toBeLessThan(20 - 45);
  });

  it('roughEllipse honours both radii', () => {
    const points = roughEllipse(0, 0, 80, 30, { seed: 1, roughness: 0 });
    expect(Math.max(...points.map((p) => Math.abs(p[0])))).toBeGreaterThan(75);
    expect(Math.max(...points.map((p) => Math.abs(p[1])))).toBeLessThan(40);
  });

  it('roughRect goes round the rectangle and past its first corner', () => {
    const points = roughRect(0, 0, 100, 60, { seed: 5 });
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(Math.min(...xs)).toBeGreaterThan(-6);
    expect(Math.max(...xs)).toBeLessThan(106);
    expect(Math.max(...ys)).toBeGreaterThan(54);
    expect(polylineLength(points)).toBeGreaterThan(320);
    expect(points[points.length - 1][0]).toBeGreaterThan(points[0][0] + 1);
  });

  it('roughArrow ends its shaft at the target with a head of two strokes around it', () => {
    const { shaft, head } = roughArrow([0, 0], [120, 40], { seed: 9, headLength: 16 });
    const tip = shaft[shaft.length - 1];
    expect(dist(tip, [120, 40])).toBeLessThan(0.001);
    expect(head).toHaveLength(3);
    expect(head[1]).toEqual(tip);
    expect(dist(head[0], tip)).toBeGreaterThan(10);
    expect(dist(head[2], tip)).toBeGreaterThan(10);
    // The wings sit behind the tip, either side of the shaft.
    expect(head[0][0]).toBeLessThan(tip[0]);
    expect(head[2][0]).toBeLessThan(tip[0]);
  });
});
