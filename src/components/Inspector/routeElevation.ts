import { extractLineCoords } from '@/engine/geoUtils';
import type { RouteItem } from '@/store/types';

export interface ElevationProfile {
  /** Altitude in metres, one per point of the route. */
  elevations: number[];
  min: number;
  max: number;
  /** Sum of every uphill step. */
  gain: number;
}

/**
 * The altitude profile of a route, or null when the route carries none. A route
 * has altitude only when every point has a third coordinate; a 2D path, or one
 * with gaps, is not guessed at.
 */
export function routeElevationProfile(item: RouteItem): ElevationProfile | null {
  const coords = extractLineCoords(item.geojson);
  if (coords.length < 2) return null;
  const elevations: number[] = [];
  for (const c of coords) {
    if (!Number.isFinite(c[2])) return null;
    elevations.push(c[2]);
  }
  let min = Infinity;
  let max = -Infinity;
  let gain = 0;
  elevations.forEach((ele, i) => {
    if (ele < min) min = ele;
    if (ele > max) max = ele;
    if (i > 0 && ele > elevations[i - 1]) gain += ele - elevations[i - 1];
  });
  return { elevations, min, max, gain };
}
