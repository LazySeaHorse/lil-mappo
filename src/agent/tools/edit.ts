import { z } from 'zod/v4';
import { getStyle } from '@/annotations/registry';
import { applyWalkPatch } from '@/engine/routeCurves';
import { vehicleChangePatch } from '@/config/vehicles';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import type {
  BoundaryItem,
  CalloutItem,
  RouteItem,
  RouteVehicleConfig,
  TimelineItem,
} from '@/store/types';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { commitAiWrite } from '../commit';
import { resolveLocation } from '../geocode';
import { summarizeItem } from '../summaries';
import {
  anchorSchema,
  boundaryStyleShape,
  calloutScaleSchema,
  calloutSettingsSchema,
  calloutSizeModeSchema,
  connectorPatchSchema,
  contentPatchSchema,
  exitAnimationSchema,
  issuesOf,
  routeStyleShape,
  transitionPatchSchema,
  vehiclePatchSchema,
} from './schemas';
import {
  type LngLat,
  type Location,
  assertTimeRange,
  currentMapZoom,
  easingSchema,
  getState,
  itemIdSchema,
  locationSchema,
  lngLatSchema,
  requireItem,
  timeSchema,
} from './shared';

const patchSchema = z
  .strictObject({
    // timing (all kinds)
    startTime: timeSchema.describe('Seconds when the item appears.'),
    endTime: timeSchema.describe('Seconds when the item ends. Must stay > startTime and <= project duration.'),
    // route + boundary
    easing: easingSchema.describe('Progress easing (route, boundary).'),
    exitAnimation: exitAnimationSchema.describe('(route, boundary)'),
    // route
    name: z.string().min(1).max(120).describe('Route timeline label.'),
    vehicle: vehiclePatchSchema.describe('Route vehicle settings (car/flight/walk routes).'),
    points: z.array(lngLatSchema).min(2).max(200).describe('Walk routes only: replace the ordered [lng, lat] points; geometry is rebuilt.'),
    curved: z.boolean().describe('Walk routes only: smooth curve vs straight segments.'),
    sharpness: z.number().min(0).max(1).describe('Walk routes only: curve tightness 0-1.'),
    // boundary
    placeName: z.string().min(1).max(200).describe('Boundary label (does not re-search the region; remove and add_boundary to change the region).'),
    // route + boundary style (which keys apply depends on the item kind)
    style: z
      .strictObject({ ...routeStyleShape, ...boundaryStyleShape })
      .partial()
      .describe(
        'Partial style merged into the existing style (other fields are kept). Route keys: color (also used for the glow and vehicle dot), width, glow, glowWidth, trailFade, trailFadeLength, dashPattern, animationType, cometTrailLength. ' +
          'Boundary keys: strokeColor, fillColor, strokeWidth, glow, fillOpacity, animateStroke, animationStyle, traceLength.',
      ),
    // callout
    content: contentPatchSchema.describe('Callout content fields merged into the existing content. Set an optional slot (subtitle, eyebrow, body, badge, metric) to null to clear it. Images cannot be set by agents.'),
    location: locationSchema.describe('Callout: new [lng, lat] or place name.'),
    styleId: z.string().max(60).describe('Callout: switch to another style id (settings reset to that style\'s defaults, then `settings` applied).'),
    anchor: anchorSchema,
    altitude: z.number().min(0).max(500).describe('Callout: height above the ground point in pixels.'),
    offset: z.tuple([z.number().min(-1000).max(1000), z.number().min(-1000).max(1000)]).describe('Callout: [x, y] pixel nudge from the anchor point.'),
    opacity: z.number().min(0).max(1).describe('Callout opacity 0-1.'),
    scale: calloutScaleSchema,
    sizeMode: calloutSizeModeSchema,
    transition: transitionPatchSchema,
    connector: connectorPatchSchema,
    settings: calloutSettingsSchema,
    linkTitleToLocation: z.boolean().describe('Callout: keep the title in sync with the place name when the location changes.'),
  })
  .partial();

const TIMING = ['startTime', 'endTime'];
const ALLOWED_KEYS: Record<'route' | 'boundary' | 'callout', string[]> = {
  route: [...TIMING, 'easing', 'exitAnimation', 'name', 'vehicle', 'points', 'curved', 'sharpness', 'style'],
  boundary: [...TIMING, 'easing', 'exitAnimation', 'placeName', 'style'],
  callout: [...TIMING, 'content', 'location', 'styleId', 'anchor', 'altitude', 'offset', 'opacity', 'scale', 'sizeMode', 'transition', 'connector', 'settings', 'linkTitleToLocation'],
};

function assertKeysAllowed(kind: keyof typeof ALLOWED_KEYS, patch: Record<string, unknown>, id: string): void {
  const bad = Object.keys(patch).filter((k) => !ALLOWED_KEYS[kind].includes(k));
  if (bad.length) {
    throw new ToolError('invalid_patch', `Field(s) ${bad.join(', ')} cannot be changed on a ${kind} (${id}). Allowed for ${kind}: ${ALLOWED_KEYS[kind].join(', ')}.`, {
      kind,
      allowed: ALLOWED_KEYS[kind],
    });
  }
}

function assertStyleKeys(kind: 'route' | 'boundary', style: Record<string, unknown>): void {
  const allowed = Object.keys(kind === 'route' ? routeStyleShape : boundaryStyleShape);
  const bad = Object.keys(style).filter((k) => !allowed.includes(k));
  if (bad.length) {
    throw new ToolError('invalid_patch', `style field(s) ${bad.join(', ')} do not apply to a ${kind}. ${kind} style fields: ${allowed.join(', ')}.`, { allowed });
  }
}

function itemLabel(item: TimelineItem): string {
  switch (item.kind) {
    case 'route': return `route "${item.name}"`;
    case 'boundary': return `boundary "${item.placeName}"`;
    case 'callout': return `callout "${item.content.title}"`;
    case 'camera': return 'camera track';
  }
}

function requireEditable(id: string): TimelineItem {
  if (id === CAMERA_TRACK_ID) {
    throw new ToolError('use_camera_tools', 'The camera track is edited with add_camera_keyframe, update_camera_keyframe and remove_camera_keyframe.');
  }
  return requireItem(id);
}

type Patch = z.output<typeof patchSchema>;

function buildRouteUpdates(item: RouteItem, patch: Patch): Partial<RouteItem> {
  const updates: Partial<RouteItem> = {};
  if (patch.name !== undefined) updates.name = patch.name;
  if (patch.easing) updates.easing = patch.easing;
  if (patch.exitAnimation) updates.exitAnimation = patch.exitAnimation;
  if (patch.style) {
    assertStyleKeys('route', patch.style);
    updates.style = { ...item.style, ...patch.style } as RouteItem['style'];
  }

  const walkFields = (['points', 'curved', 'sharpness'] as const).filter((k) => patch[k] !== undefined);
  if (walkFields.length) {
    if (item.calculation?.mode !== 'walk') {
      throw new ToolError('invalid_patch', `${walkFields.join(', ')} only apply to walk routes; this route is ${item.calculation?.mode ?? 'imported'}. Remove it and add_route again to change its endpoints.`);
    }
    Object.assign(updates, applyWalkPatch(item.calculation, {
      ...(patch.points && { points: patch.points as LngLat[] }),
      ...(patch.curved !== undefined && { curved: patch.curved }),
      ...(patch.sharpness !== undefined && { sharpness: patch.sharpness }),
    }));
  }

  if (patch.vehicle) {
    const calculation = updates.calculation ?? item.calculation;
    if (!calculation) throw new ToolError('invalid_patch', 'This imported route has no vehicle settings.');
    const vehicle = { ...(calculation.vehicle ?? { enabled: true, type: 'dot', modelId: '', scale: 1 }), ...patch.vehicle } as RouteVehicleConfig;
    Object.assign(updates, vehicleChangePatch({ ...item, ...updates } as RouteItem, calculation, vehicle));
  }
  return updates;
}

function buildBoundaryUpdates(item: BoundaryItem, patch: Patch): Partial<BoundaryItem> {
  const updates: Partial<BoundaryItem> = {};
  if (patch.placeName !== undefined) updates.placeName = patch.placeName;
  if (patch.easing) updates.easing = patch.easing;
  if (patch.exitAnimation) updates.exitAnimation = patch.exitAnimation;
  if (patch.style) {
    assertStyleKeys('boundary', patch.style);
    updates.style = { ...item.style, ...patch.style } as BoundaryItem['style'];
  }
  return updates;
}

function buildCalloutUpdates(item: CalloutItem, patch: Patch, place?: { coordinates: LngLat; name?: string }): Partial<CalloutItem> {
  const updates: Partial<CalloutItem> = {};
  let styleId = item.styleId;
  let settings = item.settings;

  if (patch.styleId !== undefined && patch.styleId !== item.styleId) {
    const next = getStyle(patch.styleId);
    if (!next) throw new ToolError('unknown_style', `Unknown callout styleId "${patch.styleId}".`);
    styleId = patch.styleId;
    settings = { ...next.defaultSettings } as Record<string, unknown>;
    updates.styleId = styleId;
    updates.styleVersion = next.version;
  }
  if (patch.settings) {
    const style = getStyle(styleId)!;
    const parsed = style.settingsSchema.safeParse({ ...settings, ...patch.settings });
    if (!parsed.success) {
      throw new ToolError('invalid_settings', `settings are not valid for style "${styleId}": ${issuesOf(parsed.error as never).map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    }
    settings = parsed.data as Record<string, unknown>;
  }
  if (settings !== item.settings) updates.settings = settings;

  let content = item.content;
  if (patch.content) {
    const next: Record<string, unknown> = { ...content };
    for (const [key, value] of Object.entries(patch.content)) {
      // null (or '' for text) clears an optional slot.
      if (value === null || (value === '' && key !== 'title')) delete next[key];
      else next[key] = value;
    }
    content = next as unknown as typeof content;
  }
  if (place?.name && item.linkTitleToLocation && patch.content?.title === undefined && patch.linkTitleToLocation !== false) {
    content = { ...content, title: place.name };
  }
  if (content !== item.content) updates.content = content;

  if (patch.linkTitleToLocation !== undefined) updates.linkTitleToLocation = patch.linkTitleToLocation;
  else if (patch.content?.title !== undefined && item.linkTitleToLocation) updates.linkTitleToLocation = false;

  if (patch.location !== undefined || patch.altitude !== undefined) {
    if (item.binding.kind !== 'geographic') {
      throw new ToolError('invalid_patch', 'This callout is pinned to the screen, not the map; location and altitude do not apply.');
    }
    updates.binding = {
      kind: 'geographic',
      lngLat: place ? place.coordinates : item.binding.lngLat,
      altitude: patch.altitude ?? item.binding.altitude,
    };
  }
  if (patch.anchor) updates.anchor = patch.anchor;
  if (patch.offset) updates.offset = patch.offset as [number, number];
  if (patch.opacity !== undefined) updates.opacity = patch.opacity;
  if (patch.scale !== undefined) updates.scale = patch.scale;
  // Turning map sizing on bases it on the zoom the user is looking at; already on, it keeps its base.
  if (patch.sizeMode !== undefined && patch.sizeMode !== item.sizeMode) {
    updates.sizeMode = patch.sizeMode;
    if (patch.sizeMode === 'map') updates.referenceZoom = currentMapZoom();
  }
  if (patch.transition) updates.transition = { ...item.transition, ...patch.transition };
  if (patch.connector) updates.connector = { ...item.connector, ...patch.connector };
  return updates;
}

export const updateItem = defineTool({
  name: 'update_item',
  title: 'Update item',
  description:
    'Changes fields of an existing route, boundary or callout (not the camera track; see update_camera_keyframe). `patch` holds only the fields to change; `style`, `content`, `transition`, `connector`, `vehicle` and `settings` are merged into the existing values, not replaced. ' +
    'id and kind cannot change. Timing: 0 <= startTime < endTime <= project duration (seconds). Fields differ per kind: route (name, vehicle, style, easing, exitAnimation, and for walk routes points/curved/sharpness), ' +
    'boundary (placeName, style, easing, exitAnimation), callout (content, location, styleId, anchor, altitude, offset, opacity, scale, sizeMode, transition, connector, settings, linkTitleToLocation). ' +
    'Fields that do not apply to the item\'s kind are rejected with the allowed list. One undo step. To change a car/flight route\'s endpoints, remove_item and add_route again.',
  input: z.strictObject({
    id: itemIdSchema,
    patch: patchSchema.describe('Fields to change. At least one.'),
  }),
  readOnly: false,
  handler: async ({ id, patch }) => {
    const item = requireEditable(id);
    const fields = Object.keys(patch);
    if (!fields.length) throw new ToolError('empty_patch', 'patch is empty; provide at least one field to change.');
    const kind = item.kind as 'route' | 'boundary' | 'callout';
    assertKeysAllowed(kind, patch, id);

    // Async work first: geocode a callout's new location.
    let place: { coordinates: LngLat; name?: string } | undefined;
    if (patch.location !== undefined) place = await resolveLocation(patch.location as Location);

    commitAiWrite(`AI: update ${itemLabel(item)} (${fields.join(', ')})`, () => {
      const current = requireItem(id); // re-read at commit time
      if (current.kind === 'camera') return;
      const start = patch.startTime ?? current.startTime;
      const end = patch.endTime ?? current.endTime;
      if (patch.startTime !== undefined || patch.endTime !== undefined) assertTimeRange(start, end);

      let updates: Partial<TimelineItem>;
      if (current.kind === 'route') updates = buildRouteUpdates(current, patch);
      else if (current.kind === 'boundary') updates = buildBoundaryUpdates(current, patch);
      else updates = buildCalloutUpdates(current, patch, place);
      if (patch.startTime !== undefined) (updates as { startTime: number }).startTime = start;
      if (patch.endTime !== undefined) (updates as { endTime: number }).endTime = end;
      getState().updateItem(id, updates);
    });

    return {
      data: { updated: summarizeItem(requireItem(id), { detail: true }), changedFields: fields },
      summary: `Updated ${itemLabel(item)}: ${fields.join(', ')}`,
      affectedItemIds: [id],
    };
  },
});

export const removeItem = defineTool({
  name: 'remove_item',
  title: 'Remove item',
  description:
    'Deletes a route, boundary or callout from the timeline by id. Camera keyframes that followed a removed route are detached. The camera track cannot be removed (use remove_camera_keyframe). One undo step, so undo restores it.',
  input: z.strictObject({ id: itemIdSchema }),
  readOnly: false,
  destructive: true,
  handler: ({ id }) => {
    const item = requireEditable(id);
    commitAiWrite(`AI: remove ${itemLabel(item)}`, () => getState().removeItem(id));
    return { data: { removed: id, kind: item.kind }, summary: `Removed ${itemLabel(item)}`, affectedItemIds: [id] };
  },
});

export const duplicateItem = defineTool({
  name: 'duplicate_item',
  title: 'Duplicate item',
  description:
    'Copies a route, boundary or callout (all settings and geometry) with " Copy" appended to its name and adds it as a new track at the end of the order. Use update_item on the copy to retime or restyle it. One undo step. Returns the new item id.',
  input: z.strictObject({ id: itemIdSchema }),
  readOnly: false,
  handler: ({ id }) => {
    const item = requireEditable(id);
    const before = new Set(getState().itemOrder);
    commitAiWrite(`AI: duplicate ${itemLabel(item)}`, () => getState().duplicateItem(id));
    const newId = getState().itemOrder.find((i) => !before.has(i));
    if (!newId) throw new ToolError('duplicate_failed', 'The item could not be duplicated.');
    return {
      data: { created: summarizeItem(requireItem(newId), { detail: false }) },
      summary: `Duplicated ${itemLabel(item)}`,
      affectedItemIds: [newId],
    };
  },
});

export const reorderItems = defineTool({
  name: 'reorder_items',
  title: 'Reorder items',
  description:
    'Sets the track order of the timeline (first = top row; also the layer stacking order for overlapping items). `itemOrder` must be a permutation of the current itemOrder from get_project: every id exactly once, including "camera-track". One undo step.',
  input: z.strictObject({
    itemOrder: z.array(z.string().min(1)).min(1).max(500).describe('Complete list of item ids in the new order.'),
  }),
  readOnly: false,
  handler: ({ itemOrder }) => {
    const current = getState().itemOrder;
    const wanted = new Set(itemOrder);
    const missing = current.filter((id) => !wanted.has(id));
    const unknown = itemOrder.filter((id) => !current.includes(id));
    if (wanted.size !== itemOrder.length || missing.length || unknown.length || itemOrder.length !== current.length) {
      throw new ToolError('not_a_permutation', 'itemOrder must contain every current item id exactly once.', {
        missing,
        unknown,
        duplicates: itemOrder.length - wanted.size,
        current,
      });
    }
    commitAiWrite('AI: reorder timeline tracks', () => getState().reorderItems(itemOrder));
    return { data: { itemOrder }, summary: 'Reordered tracks', affectedItemIds: itemOrder };
  },
});
