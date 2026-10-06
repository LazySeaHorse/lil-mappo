import distance from '@turf/distance';
import { point } from '@turf/helpers';

function interpolateCoord(a: number[], b: number[], frac: number): number[] {
  const x = a[0] + frac * (b[0] - a[0]);
  const y = a[1] + frac * (b[1] - a[1]);
  if (a[2] !== undefined && b[2] !== undefined) {
    return [x, y, a[2] + frac * (b[2] - a[2])];
  }
  return [x, y];
}

// Cumulative haversine distance (km) per vertex, computed once per coordinate array.
const cumulativeCache = new WeakMap<number[][], Float64Array>();

function getCumulative(coords: number[][]): Float64Array {
  let table = cumulativeCache.get(coords);
  if (table) return table;
  table = new Float64Array(coords.length);
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += distance(point(coords[i - 1]), point(coords[i]), { units: 'kilometers' });
    table[i] = acc;
  }
  cumulativeCache.set(coords, table);
  return table;
}

export function getLineSegment(fullCoords: number[][], startT: number, endT: number): number[][] {
  if (fullCoords.length < 2) return fullCoords;
  const t1 = Math.max(0, Math.min(1, startT));
  const t2 = Math.max(0, Math.min(1, endT));

  if (t1 > t2) return [];

  const cum = getCumulative(fullCoords);
  const totalLength = cum[cum.length - 1];
  if (totalLength === 0) {
    return [fullCoords[0], fullCoords[0]];
  }
  const startDist = t1 * totalLength;
  const endDist = t2 * totalLength;

  // First segment i (>=1) with cum[i] >= startDist.
  let lo = 1;
  let hi = fullCoords.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cum[mid] >= startDist) hi = mid;
    else lo = mid + 1;
  }

  const result: number[][] = [];
  let started = false;

  for (let i = lo; i < fullCoords.length; i++) {
    const segStartDist = cum[i - 1];
    const segEndDist = cum[i];
    const segLen = segEndDist - segStartDist;
    if (segStartDist > endDist) break;

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

  if (result.length === 0) {
    const coord = t1 >= 1 ? fullCoords[fullCoords.length - 1] : fullCoords[0];
    return [coord, coord];
  }

  if (result.length === 1) {
    return [result[0], result[0]];
  }

  return result;
}

export function getAnimatedLine(fullCoords: number[][], t: number): number[][] {
  return getLineSegment(fullCoords, 0, t);
}
