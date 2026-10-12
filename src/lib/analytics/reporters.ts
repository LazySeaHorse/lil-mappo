/**
 * Call-site helpers that pick the right channel for the current auth state:
 * the normal typed event for signed-in users, an anonymous aggregate counter
 * for guests. Keeps call sites to one line.
 */
import { useAuthStore } from '@/store/useAuthStore';
import { trackAnonymous } from './anonymous';
import { bucketPointCount, type RouteSource } from './events';
import { track } from './index';

const isSignedIn = () => !!useAuthStore.getState().user;

/** A route was added to the project. `pointCount` is bucketed; nothing else about the route is sent. */
export function reportRouteAdded(source: RouteSource, pointCount: number): void {
  if (isSignedIn()) track('route_added', { source, point_bucket: bucketPointCount(pointCount) });
  else trackAnonymous('guest_route_added', { source });
}
