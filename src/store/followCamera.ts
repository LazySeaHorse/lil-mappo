import { extractLineCoords } from '@/engine/geoUtils';
import type { Project } from './types';
import { isRouteItem } from './typeGuards';

/** Why a route cannot follow the camera. */
export type FollowCameraBlock =
  | { ok: false; reason: 'not-found' }
  /** The route has fewer than 2 points. */
  | { ok: false; reason: 'no-path' }
  /** Another route already follows the camera during this route's time. */
  | { ok: false; reason: 'overlap'; otherName: string };

export type FollowCameraResult = { ok: true } | FollowCameraBlock;

/**
 * The rules for turning on Follow camera (`autoCam`) for a route: it needs a path of at
 * least 2 points, and its time span must not overlap another route that already follows
 * the camera (the camera can follow one route at a time). Routes that only touch end to
 * start do not overlap.
 */
export function canEnableFollowCamera(project: Pick<Project, 'items'>, routeId: string): FollowCameraResult {
  const route = project.items[routeId];
  if (!isRouteItem(route)) return { ok: false, reason: 'not-found' };

  if (extractLineCoords(route.geojson).length < 2) return { ok: false, reason: 'no-path' };

  const other = Object.values(project.items).find(
    (candidate) =>
      isRouteItem(candidate) &&
      candidate.id !== route.id &&
      Boolean(candidate.autoCam?.enabled) &&
      candidate.startTime < route.endTime &&
      candidate.endTime > route.startTime,
  );
  if (other && isRouteItem(other)) return { ok: false, reason: 'overlap', otherName: other.name };

  return { ok: true };
}
