import { useProjectStore } from '@/store/useProjectStore';
import { beginGesture, endGesture, withHistoryLabel } from '@/store/history';
import { createEndpointRouteItem, defaultEndpointRouteName } from '@/store/itemFactories';
import { spokeSchedule, type SpokeTiming } from '@/engine/hubSpoke';
import type { RouteItem } from '@/store/types';

export interface HubRouteInput {
  mode: 'car' | 'flight';
  start: [number, number];
  end: [number, number];
  startName: string;
  endName: string;
  geojson: GeoJSON.FeatureCollection;
}

/** The undo label of a hub and spoke insert. */
export const createdRoutesLabel = (count: number) => `Created ${count} ${count === 1 ? 'route' : 'routes'}`;

/**
 * Adds one ordinary route per spoke, placed from `startTime` by `timing`, as ONE undo step.
 * Each is made by the factory the single-route planner uses. Returns the new routes in order.
 */
export function createHubRoutes(
  inputs: HubRouteInput[],
  { timing, gap, startTime, pro }: { timing: SpokeTiming; gap: number; startTime: number; pro: boolean },
): RouteItem[] {
  const times = spokeSchedule(inputs.length, timing, startTime, gap);
  const items = inputs.map((input, i) =>
    createEndpointRouteItem({
      ...input,
      name: defaultEndpointRouteName(input.mode, input.startName, input.endName),
      ...times[i],
      pro,
    }),
  );
  withHistoryLabel(createdRoutesLabel(items.length), () => {
    beginGesture();
    try {
      for (const item of items) useProjectStore.getState().addItem(item);
    } finally {
      endGesture();
    }
  });
  return items;
}
