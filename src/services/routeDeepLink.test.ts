import { describe, expect, it } from 'vitest';
import { CAMERA_TRACK_ID, createProject } from '@/store/projectDocument';
import { createCameraKeyframe, createDefaultVehicle, createWalkRouteItem } from '@/store/itemFactories';
import type { RouteItem } from '@/store/types';
import {
  buildRouteDeepLinkProject,
  hasProjectContent,
  isSameDeepLinkContent,
} from './routeDeepLink';

function build(slug: string, autocam: 'chase' | 'drone' | 'reveal' | 'topdown' = 'chase') {
  const result = buildRouteDeepLinkProject({ slug, autocam });
  if ('message' in result) throw new Error(result.message);
  return result;
}

function routesOf(project: ReturnType<typeof createProject>): RouteItem[] {
  return Object.values(project.items).filter((item): item is RouteItem => item.kind === 'route');
}

describe('buildRouteDeepLinkProject', () => {
  it('builds exactly one flight route with a plane marker and AutoCam enabled', () => {
    const { project, fromCode, toCode } = build('jfk-to-lhr');
    const routes = routesOf(project);

    expect(fromCode).toBe('JFK');
    expect(toCode).toBe('LHR');
    expect(project.name).toBe('JFK to LHR');
    expect(routes).toHaveLength(1);
    expect(project.itemOrder).toEqual([CAMERA_TRACK_ID, routes[0].id]);

    const [route] = routes;
    expect(route.calculation?.mode).toBe('flight');
    expect(route.calculation?.vehicle).toEqual(createDefaultVehicle('flight'));
    expect(route.autoCam?.enabled).toBe(true);
    expect(route.autoCam?.preset).toBe('chase');
    expect(route.startTime).toBe(0);
    expect(route.endTime).toBe(5);
    expect(route.geojson.features[0].geometry.type).toBe('LineString');
  });

  it('puts the departure and arrival airport coordinates at the ends of the arc', () => {
    const { project } = build('JFK-to-LHR');
    const [route] = routesOf(project);
    const calc = route.calculation as { startPoint: [number, number]; endPoint: [number, number] };
    const line = route.geojson.features[0].geometry as GeoJSON.LineString;

    expect(line.coordinates[0][0]).toBeCloseTo(calc.startPoint[0], 2);
    expect(line.coordinates[0][1]).toBeCloseTo(calc.startPoint[1], 2);
    expect(line.coordinates.at(-1)![0]).toBeCloseTo(calc.endPoint[0], 2);
    expect(project.mapCenter).toEqual(calc.startPoint);
  });

  it('resolves ICAO codes to the same airports as IATA codes', () => {
    const iata = routesOf(build('jfk-to-lhr').project)[0].calculation;
    const icao = routesOf(build('kjfk-to-egll').project)[0].calculation;
    expect(icao).toEqual(iata);
  });

  it.each(['chase', 'drone', 'reveal', 'topdown'] as const)('applies the %s preset', (preset) => {
    const [route] = routesOf(build('jfk-to-lhr', preset).project);
    expect(route.autoCam).toMatchObject({ enabled: true, preset });
  });

  it('rejects malformed slugs with a friendly message', () => {
    const result = buildRouteDeepLinkProject({ slug: 'new-york-to-london', autocam: 'chase' });
    expect(result.ok).toBe(false);
  });

  it('rejects the same airport on both ends', () => {
    const result = buildRouteDeepLinkProject({ slug: 'jfk-to-jfk', autocam: 'chase' });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects well-formed codes that are not airports, naming them', () => {
    const result = buildRouteDeepLinkProject({ slug: 'zzz-to-lhr', autocam: 'chase' });
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toContain('ZZZ');
  });
});

describe('hasProjectContent', () => {
  it('is false for a new project and true once it has an item or keyframe', () => {
    expect(hasProjectContent(createProject())).toBe(false);
    expect(hasProjectContent(build('jfk-to-lhr').project)).toBe(true);

    const withKeyframe = createProject({
      items: {
        [CAMERA_TRACK_ID]: {
          kind: 'camera',
          id: CAMERA_TRACK_ID,
          keyframes: [createCameraKeyframe({ time: 0, center: [0, 0], zoom: 3 })],
        },
      },
    });
    expect(hasProjectContent(withKeyframe)).toBe(true);
  });
});

describe('isSameDeepLinkContent', () => {
  it('treats two builds of the same link as the same content despite new ids', () => {
    expect(isSameDeepLinkContent(build('jfk-to-lhr').project, build('jfk-to-lhr').project)).toBe(true);
  });

  it('ignores panning but notices a different route or an edit', () => {
    const a = build('jfk-to-lhr').project;
    expect(isSameDeepLinkContent({ ...a, mapCenter: [10, 10] }, build('jfk-to-lhr').project)).toBe(true);
    expect(isSameDeepLinkContent(a, build('jfk-to-cdg').project)).toBe(false);

    const [route] = routesOf(a);
    const edited = { ...a, items: { ...a.items, [route.id]: { ...route, name: 'My flight' } } };
    expect(isSameDeepLinkContent(edited, build('jfk-to-lhr').project)).toBe(false);

    const extra = createWalkRouteItem({ points: [[0, 0], [1, 1]], startTime: 0 });
    const withExtra = { ...a, items: { ...a.items, [extra.id]: extra }, itemOrder: [...a.itemOrder, extra.id] };
    expect(isSameDeepLinkContent(withExtra, build('jfk-to-lhr').project)).toBe(false);
  });
});
