import { autoCamPresetPatch, defaultAutoCamFor } from '@/config/vehicles';
import { getAirportByCode } from '@/services/airports/airportService';
import { calculateFlightArc } from '@/services/flightPath';
import { parseRouteSlug } from '@/services/routeSlug';
import { CAMERA_TRACK_ID, createProject, toProjectDocument } from '@/store/projectDocument';
import { createEndpointRouteItem, defaultEndpointRouteName, wrapGeometry } from '@/store/itemFactories';
import type { AutoCamPreset, Project } from '@/store/types';

/** What the `/routes/:slug?autocam=` URL asks for, before any validation. */
export interface RouteDeepLinkRequest {
  slug: string;
  autocam: AutoCamPreset;
}

export type RouteDeepLinkResult =
  | { ok: true; project: Project; fromCode: string; toCode: string }
  | { ok: false; message: string };

/**
 * Builds the project a deep link opens: one 3D flight route between two
 * airports with AutoCam enabled, made by the same factories as the Plan Route
 * dropdown so it matches a route created in the UI. Pure; touches no store.
 */
export function buildRouteDeepLinkProject(request: RouteDeepLinkRequest): RouteDeepLinkResult {
  const parsed = parseRouteSlug(request.slug);
  // `in` narrows the unions; tsconfig.app.json has strict: false, so `ok` alone does not.
  if ('error' in parsed) {
    return {
      ok: false,
      message: parsed.error === 'same_airport'
        ? 'Pick two different airports for a flight route.'
        : "That route link isn't valid. Use airport codes like jfk-to-lhr.",
    };
  }

  const from = getAirportByCode(parsed.from);
  const to = getAirportByCode(parsed.to);
  if (!from || !to) {
    const unknown = [!from && parsed.from, !to && parsed.to].filter(Boolean).join(' and ');
    return { ok: false, message: `Couldn't find airport ${unknown}. Starting a blank project instead.` };
  }

  const route = createEndpointRouteItem({
    mode: 'flight',
    geojson: wrapGeometry(calculateFlightArc(from.coordinates, to.coordinates)),
    start: from.coordinates,
    end: to.coordinates,
    name: defaultEndpointRouteName('flight', from.name, to.name),
    startTime: 0,
  });
  route.autoCam = {
    ...defaultAutoCamFor('plane'),
    ...autoCamPresetPatch(request.autocam, 'plane'),
    enabled: true,
  };

  const project = createProject({
    name: `${parsed.from} to ${parsed.to}`,
    items: {
      [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] },
      [route.id]: route,
    },
    itemOrder: [CAMERA_TRACK_ID, route.id],
    mapCenter: from.coordinates,
  });
  return { ok: true, project, fromCode: parsed.from, toCode: parsed.to };
}

/** True when a project holds anything a user could lose: any item besides an empty camera track. */
export function hasProjectContent(project: Project): boolean {
  return Object.values(project.items).some((item) => item.kind !== 'camera' || item.keyframes.length > 0);
}

// Ids are random per build and mapCenter follows every pan, so neither says whether the user edited anything.
function contentFingerprint(project: Project): string {
  const { id: _id, mapCenter: _center, itemOrder: _order, items, ...rest } = toProjectDocument(project);
  const itemsWithoutIds = project.itemOrder.map((itemId) => {
    const { id: _itemId, ...item } = items[itemId] as { id: string };
    return item;
  });
  return JSON.stringify({ ...rest, itemsWithoutIds });
}

/** True when `current` is a deep-link project nobody has edited, so replacing it loses nothing. */
export function isSameDeepLinkContent(current: Project, generated: Project): boolean {
  return contentFingerprint(current) === contentFingerprint(generated);
}
