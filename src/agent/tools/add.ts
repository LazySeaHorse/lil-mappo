import { z } from 'zod/v4';
import { getDirections } from '@/services/directions';
import { searchBoundary } from '@/services/nominatim';
import { calculateFlightArc } from '@/services/flightPath';
import { getAllStyles, getStyle } from '@/annotations/registry';
import {
  DEFAULT_BOUNDARY_STYLE,
  createBoundaryItem,
  createCalloutItem,
  createEndpointRouteItem,
  createWalkRouteItem,
  defaultEndpointRouteName,
  wrapGeometry,
} from '@/store/itemFactories';
import type { RouteItem } from '@/store/types';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { commitAiWrite } from '../commit';
import { geoStats } from '../geo';
import { resolveLocation } from '../geocode';
import { summarizeItem } from '../summaries';
import {
  anchorSchema,
  boundaryStylePatchSchema,
  calloutSettingsSchema,
  contentShape,
  routeStylePatchSchema,
  vehiclePatchSchema,
  issuesOf,
} from './schemas';
import {
  type LngLat,
  type Location,
  getState,
  lngLatSchema,
  locationSchema,
  resolveNewTimeRange,
  timeSchema,
} from './shared';

const timing = {
  startTime: timeSchema.optional().describe('Seconds when the item appears. Default: current playhead time.'),
  endTime: timeSchema.optional().describe('Seconds when the item ends. Default: startTime + 5, capped at the project duration. Must be > startTime and <= duration.'),
};

// ---- add_route -------------------------------------------------------------

export const addRoute = defineTool({
  name: 'add_route',
  title: 'Add route',
  description:
    'Adds an animated route line to the timeline. mode "car": driving directions between `from` and `to` (Mapbox Directions; the result includes distance in meters and drive time in seconds). ' +
    'mode "flight": great-circle arc between `from` and `to` with a plane marker. mode "walk": a hand-placed path through `points` (2+ [lng, lat]), or from/to if no points. ' +
    '`from`/`to` accept [lng, lat] or a place name (geocoded; see search_place). The line draws itself between startTime and endTime (seconds on the project timeline, default: playhead to +5s). ' +
    '`style` is a partial style (color, width, glow, dashPattern, animationType...). One undo step. Frame it with frame_items or add_camera_keyframe. Returns the new item id.',
  input: z.strictObject({
    mode: z.enum(['car', 'flight', 'walk']).describe('car = driving directions; flight = great-circle arc; walk = freehand path through points.'),
    from: locationSchema.optional().describe('Start ([lng, lat] or place name). Required for car and flight.'),
    to: locationSchema.optional().describe('End ([lng, lat] or place name). Required for car and flight.'),
    points: z.array(lngLatSchema).min(2).max(200).optional().describe('Walk mode: ordered [lng, lat] points (2-200).'),
    curved: z.boolean().optional().describe('Walk mode: smooth Bezier curve through the points (default true) instead of straight segments.'),
    name: z.string().min(1).max(120).optional().describe('Timeline label. Default derived from the endpoints.'),
    ...timing,
    style: routeStylePatchSchema.optional().describe('Partial route style merged over the defaults.'),
    vehicle: vehiclePatchSchema.optional().describe('Partial vehicle settings merged over the defaults (dot for car/walk, plane for flight).'),
  }),
  readOnly: false,
  handler: async (input) => {
    const { mode } = input;
    if (mode !== 'walk' && (input.from === undefined || input.to === undefined)) {
      throw new ToolError('missing_endpoints', `mode "${mode}" needs both \`from\` and \`to\`.`);
    }
    if (mode === 'walk' && !input.points && (input.from === undefined || input.to === undefined)) {
      throw new ToolError('missing_points', 'mode "walk" needs `points` (2+ [lng, lat]) or both `from` and `to`.');
    }
    resolveNewTimeRange(input.startTime, input.endTime); // fail fast before any network call

    // 1. Async work first.
    let item: RouteItem;
    let extra: Record<string, unknown> = {};
    if (mode === 'walk') {
      const points = (input.points as LngLat[] | undefined) ?? [
        (await resolveLocation(input.from as Location)).coordinates,
        (await resolveLocation(input.to as Location)).coordinates,
      ];
      item = createWalkRouteItem({ points, curved: input.curved, name: input.name, startTime: 0 });
    } else {
      const [from, to] = await Promise.all([resolveLocation(input.from as Location), resolveLocation(input.to as Location)]);
      let geometry: GeoJSON.Geometry;
      if (mode === 'car') {
        try {
          const dir = await getDirections(from.coordinates, to.coordinates);
          geometry = dir.geometry;
          extra = { distanceMeters: Math.round(dir.distance), driveTimeSeconds: Math.round(dir.duration) };
        } catch (err) {
          throw new ToolError('directions_failed', `Could not get driving directions: ${err instanceof Error ? err.message : String(err)}. Try flight or walk mode, or different endpoints.`);
        }
      } else {
        geometry = calculateFlightArc(from.coordinates, to.coordinates);
      }
      item = createEndpointRouteItem({
        mode,
        geojson: wrapGeometry(geometry),
        start: from.coordinates,
        end: to.coordinates,
        name: input.name ?? defaultEndpointRouteName(mode, from.name, to.name),
        startTime: 0,
      });
    }

    // 2. One synchronous, labeled write.
    const label = `AI: add ${mode} route "${item.name}"`;
    commitAiWrite(label, () => {
      const [startTime, endTime] = resolveNewTimeRange(input.startTime, input.endTime);
      item.startTime = startTime;
      item.endTime = endTime;
      item.style = { ...item.style, ...input.style };
      if (input.vehicle && item.calculation) {
        item.calculation = {
          ...item.calculation,
          vehicle: { ...item.calculation.vehicle!, ...input.vehicle },
        };
      }
      getState().addItem(item);
    });

    return {
      data: { created: summarizeItem(item, { detail: false }), ...extra },
      summary: `Added ${mode} route "${item.name}" (${item.startTime}s-${item.endTime}s)`,
      affectedItemIds: [item.id],
    };
  },
});

// ---- add_boundary ----------------------------------------------------------

export const addBoundary = defineTool({
  name: 'add_boundary',
  title: 'Add boundary',
  description:
    'Adds an outlined region (country, state, city, district) found by name via OpenStreetMap Nominatim; the best polygon match is used. ' +
    'It animates in at startTime and leaves at endTime (seconds; default: playhead to +5s). `style` is partial (strokeColor, fillColor, fillOpacity, animationStyle fade|draw|trace...). ' +
    'One undo step. Returns the item id, resolved place name and bbox [west, south, east, north] (pass the id to frame_items to frame it).',
  input: z.strictObject({
    query: z.string().min(2).max(200).describe('Region name, e.g. "Portugal", "Manhattan, New York", "Bavaria".'),
    ...timing,
    style: boundaryStylePatchSchema.optional().describe('Partial boundary style merged over the defaults.'),
  }),
  readOnly: false,
  handler: async ({ query, startTime, endTime, style }) => {
    resolveNewTimeRange(startTime, endTime);
    let results;
    try {
      results = await searchBoundary(query);
    } catch (err) {
      throw new ToolError('boundary_search_failed', `Boundary search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const best = results[0];
    if (!best) {
      throw new ToolError('boundary_not_found', `No region outline found for "${query}". Try a broader or differently spelled name (regions, cities and countries work; addresses and POIs do not).`, { query });
    }
    const placeName = best.display_name.split(',')[0];
    const item = createBoundaryItem({ placeName, geojson: best.geojson, startTime: 0, style: { ...DEFAULT_BOUNDARY_STYLE, ...style } });

    commitAiWrite(`AI: add boundary "${placeName}"`, () => {
      const [s, e] = resolveNewTimeRange(startTime, endTime);
      item.startTime = s;
      item.endTime = e;
      getState().addItem(item);
    });

    return {
      data: {
        created: summarizeItem(item, { detail: false }),
        resolvedName: best.display_name,
        bbox: geoStats(best.geojson).bbox,
        otherMatches: results.slice(1).map((r) => r.display_name),
      },
      summary: `Added boundary "${placeName}" (${item.startTime}s-${item.endTime}s)`,
      affectedItemIds: [item.id],
    };
  },
});

// ---- add_callout -----------------------------------------------------------

export const addCallout = defineTool({
  name: 'add_callout',
  title: 'Add callout',
  description:
    'Adds a callout (label card or marker) pinned to a map location. `location` is [lng, lat] or a place name (geocoded; see search_place). ' +
    '`styleId` selects the look (default "topo-label"; ids and the content each uses are listed by get_guide). Content: title plus optional subtitle, eyebrow, body, badge, metric (styles show only the slots they support). ' +
    'Visible between startTime and endTime (seconds; default: playhead to +5s). `anchor` and `altitude` (pixels above ground) fine-tune placement. `settings` are style-specific overrides validated by the style. One undo step. Returns the item id.',
  input: z.strictObject({
    title: contentShape.title.min(1),
    subtitle: contentShape.subtitle.optional(),
    eyebrow: contentShape.eyebrow.optional(),
    body: contentShape.body.optional(),
    badge: contentShape.badge.optional(),
    metric: contentShape.metric.optional(),
    location: locationSchema,
    styleId: z.string().max(60).optional().describe('Callout style id. Default "topo-label". See get_guide.'),
    ...timing,
    anchor: anchorSchema.optional(),
    altitude: z.number().min(0).max(500).optional().describe('Card height above the ground point in screen pixels (styles that support it). Default 40 for cards, 0 for flat markers.'),
    settings: calloutSettingsSchema.optional(),
  }),
  readOnly: false,
  handler: async (input) => {
    const styleId = input.styleId ?? 'topo-label';
    const style = getStyle(styleId);
    if (!style) {
      throw new ToolError('unknown_style', `Unknown callout styleId "${styleId}".`, { available: getAllStyleIds() });
    }
    resolveNewTimeRange(input.startTime, input.endTime);
    const place = await resolveLocation(input.location as Location);

    const { title, subtitle, eyebrow, body, badge, metric } = input;
    const item = createCalloutItem({
      styleId,
      content: { title, ...(subtitle && { subtitle }), ...(eyebrow && { eyebrow }), ...(body && { body }), ...(badge && { badge }), ...(metric && { metric }) },
      lngLat: place.coordinates,
      startTime: 0,
      linkTitleToLocation: false,
    })!;
    if (input.anchor) item.anchor = input.anchor;
    if (input.altitude !== undefined && item.binding.kind === 'geographic') item.binding = { ...item.binding, altitude: input.altitude };
    if (input.settings) {
      const parsed = style.settingsSchema.safeParse({ ...style.defaultSettings, ...input.settings });
      if (!parsed.success) {
        throw new ToolError('invalid_settings', `settings are not valid for style "${styleId}": ${issuesOf(parsed.error as never).map((i) => `${i.path}: ${i.message}`).join('; ')}`);
      }
      item.settings = parsed.data as Record<string, unknown>;
    }

    commitAiWrite(`AI: add callout "${title}"`, () => {
      const [s, e] = resolveNewTimeRange(input.startTime, input.endTime);
      item.startTime = s;
      item.endTime = e;
      getState().addItem(item);
    });

    return {
      data: { created: summarizeItem(item, { detail: false }), ...(place.name ? { resolvedPlace: place.name } : {}) },
      summary: `Added callout "${title}" (${item.startTime}s-${item.endTime}s)`,
      affectedItemIds: [item.id],
    };
  },
});

function getAllStyleIds(): string[] {
  return getAllStyles().map((s) => s.id);
}
