import { DEFAULT_ITEM_DURATION } from '@/store/itemFactories';
import { isPlacedPoint, UNSET_POINT } from '@/engine/routeMode';

/**
 * Hub and spoke: one side of a route planner becomes a list. The planner then makes one
 * ordinary route per spoke, all sharing the hub on the other side.
 */

/** The side that is a list: `start` fans out from the hub, `end` converges on it. */
export type SpokeSide = 'start' | 'end';

export type SpokeTiming = 'together' | 'sequence' | 'staggered';

/** Most spokes one side can hold. Pasting more drops the rest. */
export const MAX_SPOKES = 20;

/** Seconds between route starts when staggering. */
export const DEFAULT_SPOKE_GAP = 1;

export interface Spoke {
  id: string;
  point: [number, number];
  name: string;
}

export const emptySpoke = (id: string): Spoke => ({ id, point: UNSET_POINT, name: '' });

const COORDINATE_PAIR = /^\s*\[?\s*-?\d+(?:\.\d+)?\s*[,\s]\s*-?\d+(?:\.\d+)?\s*\]?\s*$/;

/**
 * Splits pasted text into place entries. Several lines split by line, so "Paris, France" stays
 * one place. One line splits at commas and semicolons, except a lone coordinate pair.
 * `dropped` counts the entries past `max`.
 */
export function splitPastedPlaces(text: string, max = MAX_SPOKES): { entries: string[]; dropped: number } {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const parts = lines.length > 1 || (lines[0] && COORDINATE_PAIR.test(lines[0]))
    ? lines
    : (lines[0] ?? '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return { entries: parts.slice(0, max), dropped: Math.max(0, parts.length - max) };
}

/** Start and end seconds of each of `count` routes, placed from `start`. */
export function spokeSchedule(
  count: number,
  timing: SpokeTiming,
  start: number,
  gap = DEFAULT_SPOKE_GAP,
  length = DEFAULT_ITEM_DURATION,
): { startTime: number; endTime: number }[] {
  const step = timing === 'together' ? 0 : timing === 'sequence' ? length : gap;
  return Array.from({ length: count }, (_, i) => ({ startTime: start + i * step, endTime: start + i * step + length }));
}

/** The two endpoints of a spoke's route: the hub on one side, the spoke on the other. */
export function spokeEndpoints(side: SpokeSide, hub: [number, number], hubName: string, spoke: Spoke) {
  return side === 'start'
    ? { start: spoke.point, startName: spoke.name, end: hub, endName: hubName }
    : { start: hub, startName: hubName, end: spoke.point, endName: spoke.name };
}

/** The spokes that can become routes: placed, with the hub placed too. */
export const placedSpokes = (spokes: Spoke[], hub: [number, number]): Spoke[] =>
  isPlacedPoint(hub) ? spokes.filter((s) => isPlacedPoint(s.point)) : [];
