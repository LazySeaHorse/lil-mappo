import { DEFAULT_ITEM_DURATION } from '@/store/itemFactories';
import { MAX_SPOKES, type SpokeSide, type SpokeTiming } from '@/engine/hubSpoke';
import type { Project, RouteItem } from '@/store/types';
import { hasPlacedEndpoints } from './plan';

/**
 * Hub and spoke in a file: the Plan Route panel makes one ordinary route per
 * place of a list, all sharing the place on the other side, placed on the
 * timeline by one of three schedules. A file has no record of that, so a run
 * of routes that look like one (same mode, one shared end, schedule matching)
 * is built that way; anything else is built as single routes. Either way the
 * step's final write sets the file's items exactly.
 */

type EndpointRoute = RouteItem & { calculation: Extract<NonNullable<RouteItem['calculation']>, { mode: 'car' | 'flight' }> };

export interface HubPlan {
  /** The side that is a list: `start` has many starts converging on one end. */
  side: SpokeSide;
  mode: 'car' | 'flight';
  /** The routes, one per place of the list, in the list's order. */
  ids: string[];
  timing: SpokeTiming;
  /** Seconds between route starts, for the staggered schedule. */
  gap: number;
}

const isEndpointRoute = (item: unknown): item is EndpointRoute => {
  const route = item as RouteItem;
  return route.kind === 'route' && !!route.calculation && route.calculation.mode !== 'walk' && hasPlacedEndpoints(route.calculation);
};

const samePoint = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

/** Which side the routes fan out from: the side they all share is the hub. Null when neither (or both) is shared. */
function hubSideOf(routes: EndpointRoute[]): SpokeSide | null {
  const [first] = routes;
  const sharedEnd = routes.every((r) => samePoint(r.calculation.endPoint, first.calculation.endPoint));
  const sharedStart = routes.every((r) => samePoint(r.calculation.startPoint, first.calculation.startPoint));
  if (sharedEnd === sharedStart) return null;
  const spokes = routes.map((r) => (sharedEnd ? r.calculation.startPoint : r.calculation.endPoint));
  const distinct = spokes.every((p, i) => spokes.findIndex((q) => samePoint(p, q)) === i);
  return distinct ? (sharedEnd ? 'start' : 'end') : null;
}

/** The schedule the starts follow (relative to the first), or null when they follow none. */
function scheduleOf(routes: EndpointRoute[]): Pick<HubPlan, 'timing' | 'gap'> | null {
  const offsets = routes.map((r) => r.startTime - routes[0].startTime);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (offsets.every((o) => near(o, 0))) return { timing: 'together', gap: 1 };
  if (offsets.every((o, i) => near(o, i * DEFAULT_ITEM_DURATION))) return { timing: 'sequence', gap: 1 };
  const gap = offsets[1];
  // The gap field runs 0.1 to 30 s.
  if (gap >= 0.1 && gap <= 30 && offsets.every((o, i) => near(o, i * gap))) return { timing: 'staggered', gap };
  return null;
}

function hubOf(routes: EndpointRoute[]): HubPlan | null {
  if (routes.length < 2 || routes.length > MAX_SPOKES) return null;
  if (routes.some((r) => r.calculation.mode !== routes[0].calculation.mode)) return null;
  const side = hubSideOf(routes);
  const schedule = scheduleOf(routes);
  if (!side || !schedule) return null;
  return { side, mode: routes[0].calculation.mode, ids: routes.map((r) => r.id), ...schedule };
}

/** The hub and spoke plans in the file: runs of neighbouring routes that one list makes. */
export function hubPlans(file: Project): HubPlan[] {
  const routes = file.itemOrder.map((id) => file.items[id]).filter((item) => item?.kind === 'route');
  const plans: HubPlan[] = [];
  for (let i = 0; i < routes.length; ) {
    let best: HubPlan | null = null;
    // The longest run from here that still reads as one list.
    for (let end = i + 2; end <= routes.length; end++) {
      const run = routes.slice(i, end);
      if (!run.every(isEndpointRoute)) break;
      const plan = hubOf(run);
      if (plan) best = plan;
    }
    if (best) {
      plans.push(best);
      i += best.ids.length;
    } else {
      i++;
    }
  }
  return plans;
}

/** The plan this route belongs to, if any. */
export const hubPlanFor = (file: Project, id: string): HubPlan | null => hubPlans(file).find((plan) => plan.ids.includes(id)) ?? null;
