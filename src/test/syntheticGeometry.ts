/** Deterministic synthetic geometry for simplification tests. */

const M_PER_DEG = 111_320;

/** Distance in metres from point p to segment a-b, on a local equirectangular plane at p's latitude. */
export function pointToSegmentMeters(p: number[], a: number[], b: number[]): number {
  const kx = M_PER_DEG * Math.cos((p[1] * Math.PI) / 180);
  const ky = M_PER_DEG;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Largest distance in metres from any vertex of `original` to the polyline `simplified`. */
export function maxDeviationMeters(original: number[][], simplified: number[][]): number {
  let max = 0;
  for (const p of original) {
    let best = Infinity;
    for (let i = 0; i < simplified.length - 1; i++) {
      best = Math.min(best, pointToSegmentMeters(p, simplified[i], simplified[i + 1]));
    }
    max = Math.max(max, best);
  }
  return max;
}

/**
 * A road-like line: ~1 m vertex spacing, long near-straight stretches with sub-metre GPS-like
 * jitter, and real bends (a sweeping curve and a hairpin). Full 6dp precision.
 */
export function syntheticRoad(): number[][] {
  const pts: number[][] = [];
  let lng = -9.14, lat = 38.72, heading = 0.3;
  const step = 1.0 / M_PER_DEG;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5);
  const legs: Array<[number, number]> = [
    [800, 0], [300, 0.006], [600, 0], [60, 0.05], [500, 0], [400, -0.004], [700, 0],
  ];
  for (const [count, turn] of legs) {
    for (let i = 0; i < count; i++) {
      heading += turn;
      lng += Math.cos(heading) * step / Math.cos((lat * Math.PI) / 180);
      lat += Math.sin(heading) * step;
      pts.push([
        Math.round((lng + rnd() * 0.15 * step) * 1e6) / 1e6,
        Math.round((lat + rnd() * 0.15 * step) * 1e6) / 1e6,
      ]);
    }
  }
  return pts;
}

export function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** A wiggly island-like polygon (~5 km across) with detail from hundreds of metres down to ~1 m, 6dp. */
export function syntheticIsland(n = 4000): GeoJSON.Polygon {
  const cx = 12.5, cy = 41.9, r0 = 0.045;
  const ring: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wiggle =
      300 * Math.sin(3 * a) + 80 * Math.sin(17 * a + 1) + 20 * Math.sin(60 * a + 2) +
      6 * Math.sin(200 * a + 3) + 1.5 * Math.sin(700 * a + 4);
    const r = r0 + wiggle / M_PER_DEG;
    ring.push([
      Math.round((cx + (r * Math.cos(a)) / Math.cos((cy * Math.PI) / 180)) * 1e6) / 1e6,
      Math.round((cy + r * Math.sin(a)) * 1e6) / 1e6,
    ]);
  }
  ring.push([...ring[0]]);
  return { type: 'Polygon', coordinates: [ring] };
}
