import { getAgentMap } from '@/agent/mapRef';
import { useProjectStore } from '@/store/useProjectStore';
import { click, pressAndRelease, warn, type DemoContext, type Target } from './actions';
import { travelDuration } from './cursor';
import type { Point } from './cursors';

/**
 * Picking a point on the map the way a person does: press the Pick on the map
 * button, then click the place. The map click is a synthetic mouse click on
 * the map's canvas at the point the location projects to, which Mapbox hears
 * like a real one and hands to the app's picker.
 */

/** How long to wait for the map to finish a move, in real ms. */
const MOVE_WAIT_MS = 2500;
/** A point nearer than this share of the canvas to an edge is panned to the middle first. */
const EDGE_SHARE = 0.15;

type PickMap = NonNullable<ReturnType<typeof getAgentMap>>;

/** Where the location is on the page, or null when the map cannot say. */
function pagePoint(map: PickMap, lngLat: [number, number]): { at: Point; fraction: Point } | null {
  const canvas = map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const projected = map.project(lngLat);
  const container = map.getContainer();
  // The map may be drawn scaled (fit mode): Mapbox reads its mouse positions with the same ratio.
  const scaleX = rect.width / (container.clientWidth || rect.width || 1);
  const scaleY = rect.height / (container.clientHeight || rect.height || 1);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return null;
  return {
    at: { x: rect.left + projected.x * scaleX, y: rect.top + projected.y * scaleY },
    fraction: { x: rect.width ? (projected.x * scaleX) / rect.width : 0.5, y: rect.height ? (projected.y * scaleY) / rect.height : 0.5 },
  };
}

/** Pans the map to the location when it is not comfortably on screen: the toolbar and panels sit over its edges. */
async function bringIntoView(ctx: DemoContext, map: PickMap, lngLat: [number, number]): Promise<void> {
  const where = pagePoint(map, lngLat);
  const inside = (f: number) => f >= EDGE_SHARE && f <= 1 - EDGE_SHARE;
  if (where && inside(where.fraction.x) && inside(where.fraction.y)) return;
  const moved = new Promise<void>((resolve) => map.once('moveend', () => resolve()));
  map.easeTo({ center: lngLat, duration: 900 });
  await Promise.race([moved, ctx.clock.realDelay(MOVE_WAIT_MS)]);
  await ctx.clock.wait(ctx.timing.afterClick);
}

/**
 * Presses `button` (a place field's Pick on the map button), pans to `lngLat`
 * if needed and clicks it on the map. False, with the picker left off, when
 * there is no map or the click was not taken.
 */
export async function pickOnMap(ctx: DemoContext, button: Target, lngLat: [number, number]): Promise<boolean> {
  const map = getAgentMap();
  if (!map) return false;
  if (!(await click(ctx, button))) return false;
  const picking = () => useProjectStore.getState().activePicker !== null;
  if (!picking()) return false;

  // The picker off again, as Escape does (a panel can step aside while it picks, taking its button).
  const cancel = () => {
    useProjectStore.getState().stopPicking();
    return false;
  };
  await bringIntoView(ctx, map, lngLat);
  const where = pagePoint(map, lngLat);
  if (!where) {
    warn('pick on the map: the location is not on the map');
    return cancel();
  }
  const canvas = map.getCanvas();
  await ctx.cursor.travel(where.at, travelDuration(ctx.cursor.position, where.at, ctx.timing.move), ctx.clock, 'pointer');
  ctx.cursor.setPressed(true);
  await ctx.clock.wait(90);
  ctx.clock.check();
  pressAndRelease(canvas, where.at);
  ctx.cursor.setPressed(false);
  await ctx.clock.wait(ctx.timing.afterClick);
  // The app's map click takes a moment to reach its picker.
  for (let waited = 0; picking() && waited < 600; waited += 50) await ctx.clock.realDelay(50);
  if (picking()) {
    warn('pick on the map: the click did not reach the picker');
    return cancel();
  }
  return true;
}
