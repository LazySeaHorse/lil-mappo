import { z } from 'zod/v4';
import { useProjectStore } from '@/store/useProjectStore';
import { CAMERA_TRACK_ID } from '@/store/projectDocument';
import { DEFAULT_ITEM_DURATION } from '@/store/itemFactories';
import type { CameraItem, EasingName, TimelineItem } from '@/store/types';
import { ToolError } from '../errors';

export const EASING_NAMES = [
  'linear',
  'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInOutSine',
  'bounce',
] as const satisfies readonly EasingName[];

// Compile-time check that EASING_NAMES covers every EasingName.
const _easingsComplete: [Exclude<EasingName, (typeof EASING_NAMES)[number]>] extends [never] ? true : never = true;
void _easingsComplete;

export const easingSchema = z.enum(EASING_NAMES).describe('Easing curve applied to the item\'s progress or the move into a keyframe.');

export const lngLatSchema = z
  .tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
  .describe('[longitude, latitude] in degrees (longitude first).');

export const locationSchema = z
  .union([lngLatSchema, z.string().min(2).max(200)])
  .describe('Either [longitude, latitude] or a place name / address / "lng,lat" string that is geocoded (same as search_place, first result).');

/** Explicit types: zod's tuple inference degrades when tsconfig has strict off. */
export type LngLat = [number, number];
export type Location = LngLat | string;

export const timeSchema = z.number().min(0).finite().describe('Seconds on the project timeline.');

export const colorSchema = z.string().min(1).max(64).describe('CSS color, e.g. "#3b82f6" or "rgb(59,130,246)".');

export const itemIdSchema = z.string().min(1).describe('Timeline item id from get_project.');

// ---- store access ----------------------------------------------------------

export function getState() {
  return useProjectStore.getState();
}

export function requireItem(id: string): TimelineItem {
  const item = getState().items[id];
  if (!item) {
    throw new ToolError('item_not_found', `No item with id "${id}". Call get_project to list item ids.`, {
      knownIds: Object.keys(getState().items),
    });
  }
  return item;
}

export function requireCamera(): CameraItem {
  const cam = getState().items[CAMERA_TRACK_ID];
  if (!cam || cam.kind !== 'camera') {
    throw new ToolError('camera_track_missing', 'The project has no camera track.');
  }
  return cam;
}

// ---- time ranges -----------------------------------------------------------

/** Validates 0 <= start < end <= duration. */
export function assertTimeRange(start: number, end: number): void {
  const { duration } = getState();
  if (!(start >= 0 && start < end && end <= duration)) {
    throw new ToolError(
      'invalid_time_range',
      `Time range [${start}, ${end}] is invalid: need 0 <= startTime < endTime <= project duration (${duration}s). ` +
        'Extend the duration with update_project_settings first if needed.',
      { startTime: start, endTime: end, duration },
    );
  }
}

/** Defaults for a new timed item: starts at the playhead, lasts 5s (clamped to the duration). */
export function resolveNewTimeRange(startTime?: number, endTime?: number): [number, number] {
  const { playheadTime, duration } = getState();
  const start = startTime ?? playheadTime;
  const end = endTime ?? Math.min(start + DEFAULT_ITEM_DURATION, duration);
  assertTimeRange(start, end);
  return [start, end];
}

export function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
