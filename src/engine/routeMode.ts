import type { RouteCalculation, RouteMode } from '@/store/types';
import { createWalkCalculation } from '@/engine/routeCurves';

/** Car and flight endpoints use [0, 0] to mean "not set yet". */
export const UNSET_POINT: [number, number] = [0, 0];

export const isPlacedPoint = (p: [number, number] | undefined): p is [number, number] =>
  p !== undefined && (p[0] !== 0 || p[1] !== 0);

/**
 * Converts a route's calculation to another mode, carrying its points across:
 * endpoints become the first and last walk points and vice versa. The vehicle
 * is kept as-is; callers adjust it through vehicleChangePatch.
 */
export function convertRouteCalculation(
  calc: RouteCalculation | undefined,
  mode: RouteMode,
): RouteCalculation {
  if (calc?.mode === mode) return calc;
  const vehicle = calc?.vehicle;

  if (calc?.mode === 'walk') {
    const { points } = calc;
    const startPoint = points[0] ?? UNSET_POINT;
    const endPoint = points.length >= 2 ? points[points.length - 1] : UNSET_POINT;
    return mode === 'walk' ? calc : { mode, startPoint, endPoint, ...(vehicle ? { vehicle } : {}) };
  }

  const startPoint = calc?.startPoint ?? UNSET_POINT;
  const endPoint = calc?.endPoint ?? UNSET_POINT;
  if (mode === 'walk') {
    return createWalkCalculation([startPoint, endPoint].filter(isPlacedPoint), vehicle);
  }

  return { mode, startPoint, endPoint, ...(vehicle ? { vehicle } : {}) };
}
