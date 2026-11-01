import '@/annotations/styles/index';
import { CAMERA_TRACK_ID, createProject, parseProjectDocument, toProjectDocument } from '@/store/projectDocument';
import {
  DEFAULT_BOUNDARY_STYLE,
  createBoundaryItem,
  createCalloutItem,
  createCameraKeyframe,
  createEndpointRouteItem,
  createModelItem,
  wrapGeometry,
} from '@/store/itemFactories';
import type { BoundaryItem, Project } from '@/store/types';

export const FRANCE: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[2, 46], [2, 49], [6, 49], [6, 46], [2, 46]]] };
export const SPAIN: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[-6, 37], [-6, 42], [2, 42], [2, 37], [-6, 37]]] };

/** A boundary as a user leaves it after editing it in the inspector. */
export function editedBoundary(): BoundaryItem {
  return {
    ...createBoundaryItem({ id: 'b-france', placeName: 'France', geojson: FRANCE, startTime: 0, countryCode: 'fr' }),
    startTime: 1.5,
    endTime: 9,
    easing: 'linear',
    exitAnimation: 'fade',
    style: {
      ...DEFAULT_BOUNDARY_STYLE,
      flagCode: 'fr',
      strokeColor: '#3b82f6',
      strokeWidth: 8,
      glow: false,
      fillOpacity: 0.35,
      maskOutside: true,
      maskOpacity: 0.6,
      animationStyle: 'trace',
      traceLength: 0.25,
    },
  };
}

/** A saved project with a bit of everything, its items interleaved in the timeline order. */
export function demoFixture(): Project {
  const france = editedBoundary();
  const spain = createBoundaryItem({ id: 'b-spain', placeName: 'Spain', geojson: SPAIN, startTime: 10, countryCode: 'es' });
  const route = createEndpointRouteItem({
    id: 'r-paris-lyon',
    mode: 'car',
    geojson: wrapGeometry({ type: 'LineString', coordinates: [[2.35, 48.85], [4.83, 45.76]] }),
    start: [2.35, 48.85],
    end: [4.83, 45.76],
    startName: 'Paris',
    endName: 'Lyon',
    name: 'Paris to Lyon',
    startTime: 3,
  });
  route.style = { ...route.style, color: '#ef4444', width: 6 };
  const callout = createCalloutItem({ id: 'c-paris', styleId: 'leader-line', content: { title: 'Paris' }, lngLat: [2.35, 48.85], startTime: 2 })!;
  const model = { ...createModelItem({ assetId: 'm-tower', name: 'Tower', position: [2.29, 48.86], startTime: 4 }), id: 'mi-tower' };
  const camera = {
    kind: 'camera' as const,
    id: CAMERA_TRACK_ID,
    keyframes: [
      createCameraKeyframe({ id: 'k1', time: 0, center: [2.35, 48.85], zoom: 5 }),
      createCameraKeyframe({ id: 'k2', time: 8, center: [-3, 40], zoom: 5, pitch: 40 }),
    ],
  };
  const project = createProject({
    id: 'project-1',
    name: 'Tour de France',
    duration: 45,
    aspectRatio: '1:1',
    exportResolution: '1080p',
    resolution: [1080, 1080],
    mapCenter: [2.35, 48.85],
    mapStyle: 'dark',
    projection: 'mercator',
    terrainEnabled: true,
    labelVisibility: { poi: false },
    show3dTrees: false,
    items: {
      [CAMERA_TRACK_ID]: camera,
      [spain.id]: spain,
      [route.id]: route,
      [france.id]: france,
      [callout.id]: callout,
      [model.id]: model,
    },
    itemOrder: [CAMERA_TRACK_ID, route.id, spain.id, callout.id, france.id, model.id],
    models: {
      'm-tower': { id: 'm-tower', fileName: 'Tower.glb', byteSize: 10, sha256: 'ab'.repeat(32), bounds: { min: [0, 0, 0], max: [1, 2, 3] } },
    },
  });
  // As read from a saved file.
  return parseProjectDocument(JSON.parse(JSON.stringify(toProjectDocument(project))));
}
