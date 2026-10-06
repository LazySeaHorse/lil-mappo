import { z } from 'zod/v4';
import { createCameraKeyframe } from '@/store/itemFactories';
import type { CameraKeyframe } from '@/store/types';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { commitAiWrite } from '../commit';
import { geoStats, unionBBox, type BBox } from '../geo';
import { getAgentMap } from '../mapRef';
import { cameraShape } from './schemas';
import {
  type LngLat,
  getState,
  requireCamera,
  requireItem,
  round,
  timeSchema,
} from './shared';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { track } from '@/lib/analytics';

const KEYFRAME_TIME_EPSILON = 1e-3;

function keyframeView(k: CameraKeyframe) {
  return {
    id: k.id,
    time: round(k.time, 3),
    center: k.camera.center.map((n) => round(n, 5)),
    zoom: round(k.camera.zoom, 2),
    pitch: round(k.camera.pitch, 1),
    bearing: round(k.camera.bearing, 1),
    easing: k.easing,
    ...(k.followRoute ? { followRoute: k.followRoute } : {}),
  };
}

function assertKeyframeTime(time: number, ignoreId?: string): void {
  const { duration } = getState();
  if (time < 0 || time > duration) {
    throw new ToolError('time_out_of_range', `Keyframe time ${time}s must be within 0..${duration}s (project duration).`, { duration });
  }
  const clash = requireCamera().keyframes.find((k) => k.id !== ignoreId && Math.abs(k.time - time) < KEYFRAME_TIME_EPSILON);
  if (clash) {
    throw new ToolError('keyframe_exists', `Keyframe ${clash.id} already exists at ${clash.time}s. Use update_camera_keyframe to change it, or pick another time.`, { keyframeId: clash.id });
  }
}

function findKeyframe(id: string): CameraKeyframe {
  const kf = requireCamera().keyframes.find((k) => k.id === id);
  if (!kf) {
    throw new ToolError('keyframe_not_found', `No camera keyframe with id "${id}". Call get_item with id "${CAMERA_TRACK_ID}" to list keyframes.`, {
      knownIds: requireCamera().keyframes.map((k) => k.id),
    });
  }
  return kf;
}

/** Non-fatal note when the user has switched the camera track off in the timeline. */
function cameraWarnings(): string[] {
  return getState().isCameraEnabled
    ? []
    : ['The camera track is switched off in the timeline, so keyframes do not move the camera until the user turns it on.'];
}

export const addCameraKeyframe = defineTool({
  name: 'add_camera_keyframe',
  title: 'Add camera keyframe',
  description:
    'Adds a camera keyframe at `time` (seconds, 0 to project duration): the map view at that moment. Between keyframes the camera eases from one to the next using the later keyframe\'s easing. ' +
    'center [lng, lat]; zoom 0-22 (2 continent, 10 city, 15 streets); pitch 0-85 degrees (0 top-down); bearing degrees clockwise from north; default easing easeInOutCubic. ' +
    'Fails if a keyframe already exists at that time (use update_camera_keyframe). To fit specific items in view use frame_items. One undo step. Returns the keyframe id.',
  input: z.strictObject({
    time: timeSchema.describe('Seconds on the project timeline, 0 to duration.'),
    center: cameraShape.center,
    zoom: cameraShape.zoom,
    pitch: cameraShape.pitch.optional().describe('Default 0.'),
    bearing: cameraShape.bearing.optional().describe('Default 0.'),
    easing: cameraShape.easing.optional(),
  }),
  readOnly: false,
  handler: ({ time, center, zoom, pitch, bearing, easing }) => {
    requireCamera();
    assertKeyframeTime(time);
    const kf = createCameraKeyframe({ time, center: center as LngLat, zoom, pitch, bearing, easing });
    commitAiWrite(`AI: add camera keyframe at ${round(time, 2)}s`, () => getState().addCameraKeyframe(kf));
    track('keyframe_added', { source: 'ai' });
    return {
      data: { created: keyframeView(kf), warnings: cameraWarnings() },
      summary: `Added camera keyframe at ${round(time, 2)}s`,
      affectedItemIds: [CAMERA_TRACK_ID],
      affectedKeyframeIds: [kf.id],
    };
  },
});

export const updateCameraKeyframe = defineTool({
  name: 'update_camera_keyframe',
  title: 'Update camera keyframe',
  description:
    'Changes fields of an existing camera keyframe (ids from get_project / get_item "camera-track"). `patch` may set time (seconds; must stay within 0..duration and not collide with another keyframe), center, zoom, pitch, bearing, easing, ' +
    'and followRoute (a route item id whose path the camera follows, or null to detach). Unspecified fields are kept. One undo step.',
  input: z.strictObject({
    id: z.string().min(1).describe('Keyframe id.'),
    patch: z
      .strictObject({
        time: timeSchema,
        center: cameraShape.center,
        zoom: cameraShape.zoom,
        pitch: cameraShape.pitch,
        bearing: cameraShape.bearing,
        easing: cameraShape.easing,
        followRoute: z.string().min(1).nullable().describe('Route item id to follow, or null.'),
      })
      .partial(),
  }),
  readOnly: false,
  handler: ({ id, patch }) => {
    const kf = findKeyframe(id);
    const fields = Object.keys(patch);
    if (!fields.length) throw new ToolError('empty_patch', 'patch is empty; provide at least one field to change.');
    if (patch.time !== undefined) assertKeyframeTime(patch.time, id);
    if (patch.followRoute) {
      const target = requireItem(patch.followRoute);
      if (target.kind !== 'route') throw new ToolError('invalid_patch', `followRoute must be a route id; "${patch.followRoute}" is a ${target.kind}.`);
    }
    const updates: Partial<CameraKeyframe> = {
      ...(patch.time !== undefined && { time: patch.time }),
      ...(patch.easing && { easing: patch.easing }),
      ...(patch.followRoute !== undefined && { followRoute: patch.followRoute }),
      camera: {
        ...kf.camera,
        ...(patch.center && { center: patch.center as LngLat }),
        ...(patch.zoom !== undefined && { zoom: patch.zoom }),
        ...(patch.pitch !== undefined && { pitch: patch.pitch }),
        ...(patch.bearing !== undefined && { bearing: patch.bearing }),
      },
    };
    commitAiWrite(`AI: update camera keyframe at ${round(kf.time, 2)}s (${fields.join(', ')})`, () =>
      getState().updateCameraKeyframe(id, updates),
    );
    return {
      data: { updated: keyframeView(findKeyframe(id)), warnings: cameraWarnings() },
      summary: `Updated camera keyframe at ${round(kf.time, 2)}s: ${fields.join(', ')}`,
      affectedItemIds: [CAMERA_TRACK_ID],
      affectedKeyframeIds: [id],
    };
  },
});

export const removeCameraKeyframe = defineTool({
  name: 'remove_camera_keyframe',
  title: 'Remove camera keyframe',
  description: 'Deletes a camera keyframe by id. The camera then eases between the remaining keyframes. One undo step, so undo restores it.',
  input: z.strictObject({ id: z.string().min(1).describe('Keyframe id.') }),
  readOnly: false,
  destructive: true,
  handler: ({ id }) => {
    const kf = findKeyframe(id);
    commitAiWrite(`AI: remove camera keyframe at ${round(kf.time, 2)}s`, () => getState().removeCameraKeyframe(id));
    return {
      data: { removed: id },
      summary: `Removed camera keyframe at ${round(kf.time, 2)}s`,
      affectedItemIds: [CAMERA_TRACK_ID],
      affectedKeyframeIds: [id],
    };
  },
});

// ---- frame_items -----------------------------------------------------------

export function boundsOfItems(itemIds: string[]): BBox {
  const boxes: (BBox | null)[] = [];
  for (const id of itemIds) {
    const item = requireItem(id);
    if (item.kind === 'route' || item.kind === 'boundary') {
      boxes.push(geoStats(item.geojson).bbox);
    } else if (item.kind === 'callout') {
      if (item.binding.kind !== 'geographic') {
        throw new ToolError('not_on_map', `Callout ${id} is pinned to the screen and has no map location to frame.`);
      }
      const [x, y] = item.binding.lngLat;
      boxes.push([x, y, x, y]);
    } else {
      throw new ToolError('cannot_frame_camera', 'The camera track has no map extent to frame.');
    }
  }
  const bbox = unionBBox(boxes);
  if (!bbox) throw new ToolError('no_geometry', 'None of the items has any geometry to frame yet.');
  return bbox;
}

/** Points/very small areas would zoom to the maximum; keep a sensible minimum span (~1 km). */
export function withMinimumSpan(b: BBox, span = 0.01): BBox {
  const [w, s, e, n] = b;
  const padX = Math.max(0, (span - (e - w)) / 2);
  const padY = Math.max(0, (span - (n - s)) / 2);
  return [w - padX, s - padY, e + padX, n + padY];
}

export const frameItems = defineTool({
  name: 'frame_items',
  title: 'Frame items',
  description:
    'Adds a camera keyframe at `time` (seconds) whose view fits all the given items (routes, boundaries, callouts) on screen, using the map\'s own camera fitting and the project\'s aspect ratio. ' +
    'padding is pixels around the bounds (default 60). pitch 0-85 (default 0) and bearing (default 0) set the viewing angle. If a keyframe already exists at that time it is replaced. ' +
    'Needs the live map (fails with map_not_ready otherwise). One undo step. Typical use: frame an item a moment before it starts, then render_frames to check.',
  input: z.strictObject({
    itemIds: z.array(z.string().min(1)).min(1).max(30).describe('Ids of routes, boundaries or callouts to fit in view.'),
    time: timeSchema.describe('Seconds on the project timeline where the keyframe is placed.'),
    padding: z.number().min(0).max(400).optional().describe('Pixels of margin around the items. Default 60.'),
    pitch: cameraShape.pitch.optional().describe('Default 0 (top-down).'),
    bearing: cameraShape.bearing.optional().describe('Default 0 (north up).'),
    easing: cameraShape.easing.optional(),
  }),
  readOnly: false,
  handler: ({ itemIds, time, padding, pitch, bearing, easing }) => {
    requireCamera();
    const map = getAgentMap();
    if (!map) {
      throw new ToolError('map_not_ready', 'The map is not ready yet (the editor may still be loading). Retry shortly, or use add_camera_keyframe with explicit center and zoom.');
    }
    const { duration, resolution } = getState();
    if (time < 0 || time > duration) {
      throw new ToolError('time_out_of_range', `time ${time}s must be within 0..${duration}s (project duration).`, { duration });
    }

    const bbox = withMinimumSpan(boundsOfItems(itemIds));
    const pad = padding ?? 60;

    // The export is width-matched to the editor viewport but has the project's
    // aspect ratio. Extra vertical padding makes the fit valid for that frame.
    const rect = map.getContainer().getBoundingClientRect();
    const exportHeight = rect.width / (resolution[0] / resolution[1]);
    const extraV = Math.min(Math.max(0, (rect.height - exportHeight) / 2), rect.height * 0.35);
    const cam = map.cameraForBounds(
      [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
      {
        padding: { top: pad + extraV, bottom: pad + extraV, left: pad, right: pad },
        bearing: bearing ?? 0,
        pitch: pitch ?? 0,
      },
    );
    if (!cam || cam.zoom === undefined || !cam.center) {
      throw new ToolError('framing_failed', 'The map could not fit those items with that padding. Try a smaller padding.');
    }
    const c = cam.center as unknown as { lng: number; lat: number } | [number, number];
    const center: LngLat = Array.isArray(c) ? [c[0], c[1]] : [c.lng, c.lat];
    const zoom = Math.max(0, Math.min(22, cam.zoom));

    const label = `AI: frame ${itemIds.length} item${itemIds.length === 1 ? '' : 's'} at ${round(time, 2)}s`;
    let kf: CameraKeyframe;
    let replaced = false;
    commitAiWrite(label, () => {
      const existing = requireCamera().keyframes.find((k) => Math.abs(k.time - time) < KEYFRAME_TIME_EPSILON);
      if (existing) {
        replaced = true;
        getState().updateCameraKeyframe(existing.id, {
          camera: { ...existing.camera, center, zoom, pitch: pitch ?? 0, bearing: bearing ?? 0 },
          ...(easing && { easing }),
        });
        kf = requireCamera().keyframes.find((k) => k.id === existing.id)!;
      } else {
        kf = createCameraKeyframe({ time, center, zoom, pitch, bearing, easing });
        getState().addCameraKeyframe(kf);
      }
    });
    if (!replaced) track('keyframe_added', { source: 'ai' });

    return {
      data: { keyframe: keyframeView(kf!), replacedExisting: replaced, framedBbox: bbox.map((n) => round(n, 4)), warnings: cameraWarnings() },
      summary: `Framed ${itemIds.length} item${itemIds.length === 1 ? '' : 's'} at ${round(time, 2)}s`,
      affectedItemIds: [CAMERA_TRACK_ID, ...itemIds],
      affectedKeyframeIds: [kf!.id],
    };
  },
});
