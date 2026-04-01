import along from '@turf/along';
import length from '@turf/length';
import distance from '@turf/distance';
import { lineString, point } from '@turf/helpers';

export function getAnimatedLine(fullCoords: number[][], t: number): number[][] {
  if (t <= 0) return [];
  if (t >= 1) return fullCoords;
  if (fullCoords.length < 2) return fullCoords;

  const line = lineString(fullCoords);
  const totalLength = length(line, { units: 'kilometers' });
  const targetLength = t * totalLength;

  let accumulated = 0;
  const result: number[][] = [fullCoords[0]];

  for (let i = 1; i < fullCoords.length; i++) {
    const segLen = distance(
      point(fullCoords[i - 1]),
      point(fullCoords[i]),
      { units: 'kilometers' }
    );
    if (accumulated + segLen >= targetLength) {
      const frac = segLen > 0 ? (targetLength - accumulated) / segLen : 0;
      const lng = fullCoords[i - 1][0] + frac * (fullCoords[i][0] - fullCoords[i - 1][0]);
      const lat = fullCoords[i - 1][1] + frac * (fullCoords[i][1] - fullCoords[i - 1][1]);
      result.push([lng, lat]);
      break;
    }
    result.push(fullCoords[i]);
    accumulated += segLen;
  }
  return result;
}
