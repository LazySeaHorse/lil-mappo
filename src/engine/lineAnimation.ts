import length from '@turf/length';
import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';

function interpolateCoord(a: number[], b: number[], frac: number): number[] {
  const x = a[0] + frac * (b[0] - a[0]);
  const y = a[1] + frac * (b[1] - a[1]);
  if (a[2] !== undefined && b[2] !== undefined) {
    return [x, y, a[2] + frac * (b[2] - a[2])];
  }
  return [x, y];
}

export function getLineSegment(fullCoords: number[][], startT: number, endT: number): number[][] {
  if (fullCoords.length < 2) return fullCoords;
  const t1 = Math.max(0, Math.min(1, startT));
  const t2 = Math.max(0, Math.min(1, endT));

  if (t1 >= t2) return [];

  const line = lineString(fullCoords);
  const totalLength = length(line, { units: 'kilometers' });
  const startDist = t1 * totalLength;
  const endDist = t2 * totalLength;

  let accumulated = 0;
  const result: number[][] = [];
  let started = false;

  for (let i = 1; i < fullCoords.length; i++) {
    const segLen = distance(
      point(fullCoords[i - 1]),
      point(fullCoords[i]),
      { units: 'kilometers' }
    );

    const segStartDist = accumulated;
    const segEndDist = accumulated + segLen;

    // Segment intersects with [startDist, endDist]
    if (segEndDist >= startDist && segStartDist <= endDist) {
      const frac0 = segLen > 0 ? (startDist - segStartDist) / segLen : 0;
      const frac1 = segLen > 0 ? (endDist - segStartDist) / segLen : 0;

      const firstCoord = segStartDist < startDist
        ? interpolateCoord(fullCoords[i - 1], fullCoords[i], frac0)
        : fullCoords[i - 1];

      const lastCoord = segEndDist > endDist
        ? interpolateCoord(fullCoords[i - 1], fullCoords[i], frac1)
        : fullCoords[i];

      if (!started) {
        result.push(firstCoord);
        started = true;
      }
      result.push(lastCoord);
      if (segEndDist >= endDist) break;
    }
    accumulated += segLen;
  }
  return result;
}

export function getAnimatedLine(fullCoords: number[][], t: number): number[][] {
  return getLineSegment(fullCoords, 0, t);
}
