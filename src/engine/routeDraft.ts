import type { RouteCalculation } from '@/store/types';
import { convertRouteCalculation } from '@/engine/routeMode';

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

/** A string that changes when the part of a calculation the path editor edits changes. */
export function editableKey(calc: RouteCalculation | undefined): string {
  return JSON.stringify(editableParts(savedCalculation(calc)));
}

/** Whether a draft differs from what the route has saved. */
export function routeDraftChanged(saved: RouteCalculation | undefined, draft: RouteCalculation): boolean {
  return editableKey(saved) !== editableKey(draft);
}
