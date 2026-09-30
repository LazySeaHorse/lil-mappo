/**
 * Deterministic hand-drawn shapes as polylines, ready for draw-on via a
 * polyline's `progress`. Each shape is a slightly wobbly, slightly overshooting
 * stroke, like a marker pass; the same seed always gives the same drawing, so
 * preview and export match. Strokes are single open polylines: draw them with
 * round caps and joins.
 */

import { seededRandom } from '../random';
import type { Point } from './geometry';

export interface RoughOptions {
  /** Picks the wobble. Vary it per callout or per shape. Default 1. */
  seed?: number;
  /** Wobble size as a multiplier; 0 gives clean geometry. Default 1. */
  roughness?: number;
}

type Rng = () => number;
const centered = (rng: Rng) => rng() * 2 - 1;

/** Perpendicular jitter of about `amount` pixels, at ~one vertex per `spacing` pixels. */
function wobblyLine(from: Point, to: Point, rng: Rng, amount: number, spacing: number): Point[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [[from[0], from[1]]];
  const nx = -dy / length;
  const ny = dx / length;
  const steps = Math.max(2, Math.round(length / spacing));
  // A gentle bow plus per-vertex noise reads as a hand rather than as jitter.
  const bow = centered(rng) * amount * 1.5;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const offset = Math.sin(t * Math.PI) * bow + (i === 0 || i === steps ? 0 : centered(rng) * amount * 0.5);
    return [from[0] + dx * t + nx * offset, from[1] + dy * t + ny * offset] as Point;
  });
}

/**
 * A single stroke from `from` to `to`, wobbling and running a little past both
 * ends (`overshoot`, as a fraction of its length; default 0.04).
 */
export function roughLine(
  from: Point,
  to: Point,
  options: RoughOptions & { overshoot?: number } = {},
): Point[] {
  const { seed = 1, roughness = 1, overshoot = 0.04 } = options;
  const rng = seededRandom(seed);
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const start: Point = [from[0] - dx * overshoot * rng(), from[1] - dy * overshoot * rng()];
  const end: Point = [to[0] + dx * overshoot * (0.5 + rng() * 0.5), to[1] + dy * overshoot * (0.5 + rng() * 0.5)];
  return wobblyLine(start, end, rng, roughness * 1.2, 24);
}

/**
 * An ellipse drawn in one pass that overshoots its start point (`overshoot`, as
 * a fraction of a turn; default 0.08) and drifts in radius so the ends do not
 * meet, as a hand-drawn circle does. `startAngle` is where the pen lands, in
 * radians clockwise from 3 o'clock (default -PI/2, the top).
 */
export function roughEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  options: RoughOptions & { overshoot?: number; startAngle?: number } = {},
): Point[] {
  const { seed = 1, roughness = 1, overshoot = 0.08, startAngle = -Math.PI / 2 } = options;
  const rng = seededRandom(seed);
  const sweep = Math.PI * 2 * (1 + overshoot);
  const steps = Math.max(12, Math.round((Math.max(rx, ry) * sweep) / 10));
  const drift = 0.06 + rng() * 0.04; // grows outward over the pass
  const phase = rng() * Math.PI * 2;
  const wobble = 0.025 * roughness;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const angle = startAngle + sweep * t;
    const k = 1 + drift * roughness * t + Math.sin(angle * 3 + phase) * wobble + centered(rng) * wobble * 0.5;
    return [cx + Math.cos(angle) * rx * k, cy + Math.sin(angle) * ry * k] as Point;
  });
}

/** A circle; see roughEllipse. */
export function roughCircle(
  cx: number,
  cy: number,
  r: number,
  options: RoughOptions & { overshoot?: number; startAngle?: number } = {},
): Point[] {
  return roughEllipse(cx, cy, r, r, options);
}

/**
 * A rectangle outline as one continuous stroke that starts at the top-left,
 * goes round clockwise and overshoots its first corner, each side a little bowed.
 */
export function roughRect(x: number, y: number, width: number, height: number, options: RoughOptions = {}): Point[] {
  const { seed = 1, roughness = 1 } = options;
  const rng = seededRandom(seed);
  const jitter = () => centered(rng) * roughness * 1.5;
  const corners: Point[] = [
    [x + jitter(), y + jitter()],
    [x + width + jitter(), y + jitter()],
    [x + width + jitter(), y + height + jitter()],
    [x + jitter(), y + height + jitter()],
  ];
  const overshoot: Point = [corners[0][0] + (corners[1][0] - corners[0][0]) * 0.06, corners[0][1] + jitter() * 0.5];
  const path: Point[] = [];
  [...corners.slice(1), corners[0], overshoot].forEach((to, i) => {
    const from = i === 0 ? corners[0] : path[path.length - 1];
    const side = wobblyLine(from, to, rng, roughness * 1.2, 24);
    path.push(...(i === 0 ? side : side.slice(1)));
  });
  return path;
}

/**
 * An arrow from `from` to `to`: a wobbly shaft and a two-stroke head at `to`.
 * Draw the shaft on first, then the head (each is its own polyline).
 */
export function roughArrow(
  from: Point,
  to: Point,
  options: RoughOptions & { headLength?: number } = {},
): { shaft: Point[]; head: Point[] } {
  const { seed = 1, roughness = 1, headLength = 14 } = options;
  const shaft = roughLine(from, to, { seed, roughness, overshoot: 0 });
  const tip = shaft[shaft.length - 1];
  const before = shaft[Math.max(0, shaft.length - 2)];
  const heading = Math.atan2(tip[1] - before[1], tip[0] - before[0]);
  const rng = seededRandom(seed + 101);
  const wing = (side: number): Point => {
    const angle = heading + Math.PI + side * (Math.PI / 7 + centered(rng) * 0.08 * roughness);
    const length = headLength * (1 + centered(rng) * 0.12 * roughness);
    return [tip[0] + Math.cos(angle) * length, tip[1] + Math.sin(angle) * length];
  };
  // One stroke: out to a wing, back through the tip, out to the other wing.
  return { shaft, head: [wing(1), [tip[0], tip[1]], wing(-1)] };
}
