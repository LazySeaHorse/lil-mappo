/**
 * Pure polyline geometry for draw-on animation.
 *
 * Canvas cannot measure SVG path strings, so strokes that draw themselves on
 * are polylines whose length is computed here and trimmed to a 0–1 fraction.
 */

export type Point = readonly [number, number];

/** Vertices to walk, with the first repeated at the end when the shape is closed. */
function vertices(points: readonly Point[], closed: boolean): readonly Point[] {
  return closed && points.length > 1 ? [...points, points[0]] : points;
}

function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Total length of the polyline in pixels. */
export function polylineLength(points: readonly Point[], closed = false): number {
  const path = vertices(points, closed);
  let total = 0;
  for (let i = 1; i < path.length; i++) total += segmentLength(path[i - 1], path[i]);
  return total;
}

/** The point `distance` pixels along the polyline, clamped to its ends. */
export function pointAtLength(points: readonly Point[], distance: number, closed = false): Point {
  const path = vertices(points, closed);
  if (path.length === 0) return [0, 0];
  if (distance <= 0) return path[0];

  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const length = segmentLength(path[i - 1], path[i]);
    if (length > 0 && travelled + length >= distance) {
      const t = (distance - travelled) / length;
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
      ];
    }
    travelled += length;
  }
  return path[path.length - 1];
}

/**
 * The part of the polyline between two fractions (0–1) of its total length,
 * with interpolated end points. Returns no points when the range is empty.
 */
export function trimPolyline(
  points: readonly Point[],
  start: number,
  end: number,
  closed = false,
): Point[] {
  const path = vertices(points, closed);
  const total = polylineLength(path);
  const from = Math.max(0, Math.min(start, 1)) * total;
  const to = Math.max(0, Math.min(end, 1)) * total;
  if (path.length < 2 || total === 0 || to <= from) return [];

  const trimmed: Point[] = [pointAtLength(path, from)];
  let travelled = 0;
  for (let i = 1; i < path.length - 1; i++) {
    travelled += segmentLength(path[i - 1], path[i]);
    if (travelled > from && travelled < to) trimmed.push(path[i]);
  }
  trimmed.push(pointAtLength(path, to));
  return trimmed;
}
