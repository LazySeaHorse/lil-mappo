import type { TimelineItem, CameraItem, RouteItem, BoundaryItem, CalloutItem } from './types';

export function isCameraItem(item: TimelineItem | null | undefined): item is CameraItem {
  return item?.kind === 'camera';
}

export function isRouteItem(item: TimelineItem | null | undefined): item is RouteItem {
  return item?.kind === 'route';
}

export function isBoundaryItem(item: TimelineItem | null | undefined): item is BoundaryItem {
  return item?.kind === 'boundary';
}

export function isCalloutItem(item: TimelineItem | null | undefined): item is CalloutItem {
  return item?.kind === 'callout';
}

/** Safely retrieves a typed item from the items record */
export function getItem<T extends TimelineItem>(
  items: Record<string, TimelineItem>,
  id: string | null | undefined,
  guard: (item: TimelineItem | null | undefined) => item is T,
): T | undefined {
  if (!id) return undefined;
  const item = items[id];
  return guard(item) ? item : undefined;
}
