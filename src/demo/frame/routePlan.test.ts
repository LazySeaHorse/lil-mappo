import { describe, expect, it } from 'vitest';
import { DEFAULT_ITEM_DURATION, createEndpointRouteItem, createImportedRouteItem, createWalkRouteItem, wrapGeometry } from '@/store/itemFactories';
import { createProject } from '@/store/projectDocument';
import type { Project, RouteItem } from '@/store/types';
import { planDemo, routeBaseline, routeEdits } from './plan';
import { hubPlanFor, hubPlans } from './routePlan';

const HUB: [number, number] = [2.35, 48.85];
const SPOKES: [number, number][] = [[4.83, 45.76], [-0.57, 44.84], [7.26, 43.7], [1.44, 43.6]];

const line = (a: [number, number], b: [number, number]) => wrapGeometry({ type: 'LineString', coordinates: [a, b] });

function toHub(id: string, from: [number, number], startTime: number, mode: 'car' | 'flight' = 'car'): RouteItem {
  return createEndpointRouteItem({ id, mode, geojson: line(from, HUB), start: from, end: HUB, startName: id, endName: 'Paris', name: `${id} to Paris`, startTime, pro: true });
}

function projectOf(...items: RouteItem[]): Project {
  const empty = createProject();
  return { ...empty, items: { ...empty.items, ...Object.fromEntries(items.map((i) => [i.id, i])) }, itemOrder: [...empty.itemOrder, ...items.map((i) => i.id)] };
}

describe('hub and spoke in a file', () => {
  it('finds routes that share an end and follow a schedule, whichever one', () => {
    const together = projectOf(toHub('a', SPOKES[0], 1), toHub('b', SPOKES[1], 1), toHub('c', SPOKES[2], 1));
    expect(hubPlans(together)).toEqual([{ side: 'start', mode: 'car', ids: ['a', 'b', 'c'], timing: 'together', gap: 1 }]);

    const sequence = projectOf(toHub('a', SPOKES[0], 0), toHub('b', SPOKES[1], 5), toHub('c', SPOKES[2], 10));
    expect(hubPlans(sequence)[0]).toMatchObject({ timing: 'sequence' });

    const staggered = projectOf(toHub('a', SPOKES[0], 2), toHub('b', SPOKES[1], 4.5), toHub('c', SPOKES[2], 7));
    expect(hubPlans(staggered)[0]).toMatchObject({ timing: 'staggered', gap: 2.5 });
  });

  it('finds a fan out of one start too', () => {
    const out = (id: string, to: [number, number], startTime: number) =>
      createEndpointRouteItem({ id, mode: 'flight', geojson: line(HUB, to), start: HUB, end: to, name: id, startTime, pro: true });
    expect(hubPlans(projectOf(out('a', SPOKES[0], 0), out('b', SPOKES[1], 1)))[0]).toMatchObject({ side: 'end', mode: 'flight', ids: ['a', 'b'] });
  });

  it('leaves single routes, walks and mixed runs alone', () => {
    const walk = createWalkRouteItem({ id: 'w', points: [[0, 0.1], [1, 1]], startTime: 0 });
    expect(hubPlans(projectOf(toHub('a', SPOKES[0], 0)))).toEqual([]);
    // No shared end.
    const apart = createEndpointRouteItem({ id: 'z', mode: 'car', geojson: line([10, 10], [11, 11]), start: [10, 10], end: [11, 11], name: 'z', startTime: 1 });
    expect(hubPlans(projectOf(toHub('a', SPOKES[0], 0), apart))).toEqual([]);
    // A flight and a drive to the same place are two plans of one route each.
    expect(hubPlans(projectOf(toHub('a', SPOKES[0], 0), toHub('b', SPOKES[1], 1, 'flight')))).toEqual([]);
    // Starts further apart than the gap field allows, or going back in time.
    expect(hubPlans(projectOf(toHub('a', SPOKES[0], 0), toHub('b', SPOKES[1], 40)))).toEqual([]);
    expect(hubPlans(projectOf(toHub('a', SPOKES[0], 4), toHub('b', SPOKES[1], 1)))).toEqual([]);
    expect(hubPlans(projectOf(toHub('a', SPOKES[0], 0), walk, toHub('b', SPOKES[1], 0)))).toEqual([]);
  });

  it('splits a long run at the first route that does not fit', () => {
    const file = projectOf(toHub('a', SPOKES[0], 0), toHub('b', SPOKES[1], 0), toHub('c', SPOKES[2], 3), toHub('d', SPOKES[3], 6));
    expect(hubPlans(file).map((p) => p.ids)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(hubPlanFor(file, 'd')?.ids).toEqual(['c', 'd']);
    expect(hubPlanFor(file, 'x')).toBeNull();
  });
});

describe('route edits', () => {
  it('lists the inspector fields that differ from what the panel makes, top to bottom', () => {
    const route = toHub('r', SPOKES[0], 3);
    route.name = 'Road trip';
    route.endTime = 11;
    route.easing = 'linear';
    route.exitAnimation = 'fade';
    route.style = { ...route.style, color: '#ef4444', width: 9, glow: false, dashPattern: [8, 4] };
    route.calculation = { ...route.calculation!, vehicle: { enabled: true, type: 'car', modelId: '', scale: 4 } } as RouteItem['calculation'];
    const plan = planDemo(projectOf(route)).find((s) => s.kind === 'item');
    // The span is not an inspector edit: the timeline step drags the clip, from the timing the panel gives it.
    expect(plan && 'timing' in plan ? plan.timing : null).toEqual({ startTime: 0, endTime: DEFAULT_ITEM_DURATION });
    expect(plan && 'edits' in plan ? plan.edits.map((e) => e.path) : null).toEqual([
      'name',
      'style.color',
      'style.width',
      'style.dashPattern',
      'style.glow',
      'calculation.vehicle.type',
      'calculation.vehicle.scale',
      'easing',
      'exitAnimation',
    ]);
  });

  it('shows an imported route’s marker as the switch and its fields, not a calculation', () => {
    const imported = createImportedRouteItem({ id: 'i', name: 'Ride', geojson: line([0, 1], [1, 2]), startTime: 0 });
    const target: RouteItem = {
      ...imported,
      calculation: { mode: 'car', startPoint: [0, 0], endPoint: [0, 0], startName: '', endName: '', vehicle: { enabled: true, type: 'plane', modelId: '', scale: 2 } },
    };
    expect(routeBaseline(target).calculation).toBeUndefined();
    expect(routeEdits(routeBaseline(target), target)).toEqual([
      { path: 'calculation.vehicle.enabled', value: true },
      { path: 'calculation.vehicle.type', value: 'plane' },
      { path: 'calculation.vehicle.scale', value: 2 },
    ]);
  });

  it('moves the end first when the new start is past the current end', () => {
    const route = { ...toHub('r', SPOKES[0], 0), startTime: 8, endTime: 12 };
    const paths = routeEdits(routeBaseline(route), route).map((e) => e.path);
    expect(paths.filter((p) => p.endsWith('Time'))).toEqual(['endTime', 'startTime']);
  });
});
