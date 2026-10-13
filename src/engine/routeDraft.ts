import type { RouteCalculation, RouteItem } from '@/store/types';
import { ROUTE_MODE_LABELS, ROUTE_PATH_TERMS } from '@/lib/terms';
import { extractLineCoords } from '@/engine/geoUtils';
import { haversineM } from '@/engine/geoMath';
import { convertRouteCalculation, placeLabel } from '@/engine/routeMode';

/** Length of a path in meters. */
function pathLengthM(geojson: GeoJSON.FeatureCollection): number {
  const coords = extractLineCoords(geojson);
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1], coords[i]);
  return total;
}

function formatPathLength(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * One line that says what a route is: "Car · Brooklyn Bridge → Central Park".
 * A place shows its name, or its coordinates when it has no name. A walk shows its
 * point count and length. A route with no calculation (an import) shows its length.
 */
export function routeSummary(route: Pick<RouteItem, 'calculation' | 'geojson'>): string {
  const { calculation: calc, geojson } = route;
  const distance = pathLengthM(geojson);

  if (!calc) {
    return distance > 0 ? `${ROUTE_PATH_TERMS.imported} · ${formatPathLength(distance)}` : ROUTE_PATH_TERMS.imported;
  }

  const mode = ROUTE_MODE_LABELS[calc.mode];
  if (calc.mode === 'walk') {
    const count = calc.points.length;
    if (count === 0) return `${mode} · ${ROUTE_PATH_TERMS.noPoints}`;
    const points = count === 1 ? ROUTE_PATH_TERMS.onePoint : ROUTE_PATH_TERMS.points(count);
    return distance > 0 ? `${mode} · ${points} · ${formatPathLength(distance)}` : `${mode} · ${points}`;
  }

  const start = placeLabel(calc.startName, calc.startPoint);
  const end = placeLabel(calc.endName, calc.endPoint);
  if (!start && !end) return `${mode} · ${ROUTE_PATH_TERMS.noPlaces}`;
  return `${mode} · ${start || ROUTE_PATH_TERMS.notSet} → ${end || ROUTE_PATH_TERMS.notSet}`;
}

/** The part of a calculation the path editor changes. The marker is not part of it. */
function editableParts(calc: RouteCalculation) {
  return calc.mode === 'walk'
    ? [calc.mode, calc.points, calc.curved, calc.sharpness]
    : [calc.mode, calc.startPoint, calc.endPoint, calc.startName, calc.endName];
}

/** The calculation a path editor starts from. A route with none counts as an unset car route. */
export function savedCalculation(calc: RouteCalculation | undefined): RouteCalculation {
  return calc ?? convertRouteCalculation(undefined, 'car');
}

/** Whether a draft differs from what the route has saved. */
export function routeDraftChanged(saved: RouteCalculation | undefined, draft: RouteCalculation): boolean {
  return JSON.stringify(editableParts(savedCalculation(saved))) !== JSON.stringify(editableParts(draft));
}
