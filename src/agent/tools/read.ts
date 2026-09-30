import { z } from 'zod/v4';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { defineTool } from '../defineTool';
import { buildGuide } from '../guide';
import { searchPlaces } from '../geocode';
import { summarizeItem } from '../summaries';
import { getState, itemIdSchema, requireItem } from './shared';

export const getGuide = defineTool({
  name: 'get_guide',
  title: 'Get guide',
  description:
    'Returns the li\'l Mappo primer as text: timeline model (seconds, layer order, camera track), item kinds and their fields, valid map style keys, label categories, callout style ids, easing names, and a recommended workflow. ' +
    'Call this first in a new session. Then use get_project to see the current state.',
  input: z.strictObject({}),
  readOnly: true,
  handler: () => ({ text: buildGuide(), summary: 'Read the guide' }),
});

export const getProject = defineTool({
  name: 'get_project',
  title: 'Get project',
  description:
    'Returns project settings (name, duration in seconds, fps, resolution, aspect ratio, projection, light preset, map style, terrain/buildings/label toggles, 3D detail flags), the playhead time, and a compact list of every timeline item in track order: ' +
    'id, kind, name/title, startTime/endTime (seconds), key style fields, and geometry summarized as point count and bbox [west, south, east, north] (never raw GeoJSON). The camera track includes all keyframes. ' +
    'Use get_item for full details of one item.',
  input: z.strictObject({}),
  readOnly: true,
  handler: () => {
    const s = getState();
    const items = s.itemOrder
      .map((id) => s.items[id])
      .filter(Boolean)
      .map((item) => summarizeItem(item, { detail: false, cameraEnabled: s.isCameraEnabled }));
    return {
      data: {
        name: s.name,
        duration: s.duration,
        fps: s.fps,
        playheadTime: s.playheadTime,
        resolution: s.resolution,
        aspectRatio: s.aspectRatio,
        exportResolution: s.exportResolution,
        isVertical: s.isVertical,
        projection: s.projection,
        lightPreset: s.lightPreset,
        starIntensity: s.starIntensity,
        fogColor: s.fogColor,
        terrainExaggeration: s.terrainExaggeration,
        mapStyle: s.mapStyle,
        terrainEnabled: s.terrainEnabled,
        buildingsEnabled: s.buildingsEnabled,
        labelVisibility: s.labelVisibility,
        show3dLandmarks: s.show3dLandmarks,
        show3dTrees: s.show3dTrees,
        show3dFacades: s.show3dFacades,
        mapCenter: s.mapCenter,
        itemOrder: s.itemOrder,
        items,
      },
      summary: `Read project (${items.length} tracks)`,
    };
  },
});

export const getItem = defineTool({
  name: 'get_item',
  title: 'Get item',
  description:
    'Returns full details of one timeline item by id (from get_project): all style fields, content, timing, easing, calculation endpoints, callout binding, or all camera keyframes for id "camera-track". ' +
    'Geometry is summarized (point count, bbox) unless includeGeometry is true, which adds the raw GeoJSON and can be large.',
  input: z.strictObject({
    id: itemIdSchema,
    includeGeometry: z.boolean().optional().describe('Include raw GeoJSON geometry (routes and boundaries). Default false; can be very large.'),
  }),
  readOnly: true,
  handler: ({ id, includeGeometry }) => {
    const item = requireItem(id);
    const out = summarizeItem(item, { detail: true, cameraEnabled: getState().isCameraEnabled });
    if (includeGeometry && (item.kind === 'route' || item.kind === 'boundary')) out.geojson = item.geojson;
    return { data: out, summary: `Read ${item.kind} ${id === CAMERA_TRACK_ID ? 'camera track' : id}` };
  },
});

export const searchPlace = defineTool({
  name: 'search_place',
  title: 'Search place',
  description:
    'Geocodes a place name or address with Mapbox. Returns up to `limit` matches as {name, fullName, coordinates: [lng, lat], bbox?: [west, south, east, north]}, biased toward the current map center. ' +
    'Use the coordinates for add_route, add_callout or add_camera_keyframe, or pass the place name directly to those tools. For area outlines use add_boundary instead.',
  input: z.strictObject({
    query: z.string().min(2).max(200).describe('Place name or address, e.g. "Eiffel Tower" or "Lisbon, Portugal".'),
    limit: z.number().int().min(1).max(10).optional().describe('Maximum results, 1-10. Default 5.'),
  }),
  readOnly: true,
  handler: async ({ query, limit }) => {
    const results = await searchPlaces(query, limit ?? 5);
    return { data: { query, results }, summary: `Searched "${query}" (${results.length} results)` };
  },
});
