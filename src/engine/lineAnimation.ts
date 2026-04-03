import along from '@turf/along';
import length from '@turf/length';
import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';

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
      let firstCoord = fullCoords[i - 1];
      let lastCoord = fullCoords[i];

      if (segStartDist < startDist) {
        const frac = segLen > 0 ? (startDist - segStartDist) / segLen : 0;
        const x = fullCoords[i - 1][0] + frac * (fullCoords[i][0] - fullCoords[i - 1][0]);
        const y = fullCoords[i - 1][1] + frac * (fullCoords[i][1] - fullCoords[i - 1][1]);
        const z = (fullCoords[i - 1][2] !== undefined && fullCoords[i][2] !== undefined)
          ? fullCoords[i - 1][2] + frac * (fullCoords[i][2] - fullCoords[i - 1][2])
          : undefined;
        firstCoord = z !== undefined ? [x, y, z] : [x, y];
      }

      if (segEndDist > endDist) {
        const frac = segLen > 0 ? (endDist - segStartDist) / segLen : 0;
        const x = fullCoords[i - 1][0] + frac * (fullCoords[i][0] - fullCoords[i - 1][0]);
        const y = fullCoords[i - 1][1] + frac * (fullCoords[i][1] - fullCoords[i - 1][1]);
        const z = (fullCoords[i - 1][2] !== undefined && fullCoords[i][2] !== undefined)
          ? fullCoords[i - 1][2] + frac * (fullCoords[i][2] - fullCoords[i - 1][2])
          : undefined;
        lastCoord = z !== undefined ? [x, y, z] : [x, y];
      }

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
