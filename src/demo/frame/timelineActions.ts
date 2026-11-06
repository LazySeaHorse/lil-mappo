import { timelineGutterWidth } from '@/constants/layout';
import { useProjectStore } from '@/store/useProjectStore';
import { click, find, moveTo, pressAndRelease, query, warn, type DemoContext } from './actions';
import { isPhoneLayout, type Locators } from './locators';

/**
 * What the timeline runner and the camera runner share: reading the timeline's
 * zoom off the screen, fitting a span of the project into view with the zoom
 * buttons, and clicking the ruler to put the playhead on a time.
 */

/** The zoom the timeline starts at (TimelinePanel's default), for when the ruler cannot say. */
const DEFAULT_PIXELS_PER_SECOND = 60;
/** Space kept clear at the right edge of the scroll box, for its scrollbar. */
const EDGE_MARGIN = 24;
/** The zoom out button's steps are 1.25x; a project never needs more than this many to fit. */
const MAX_ZOOM_CLICKS = 14;
/** A zoom that moved by less than this (px per second) did not move. */
const ZOOM_EPSILON = 0.01;

/** Pixels per second of the timeline as drawn, read off the ruler's past-the-end shade (it starts at duration x zoom). */
export function pixelsPerSecond(): number {
  const duration = useProjectStore.getState().duration;
  const x = Number(query({ attrs: { 'data-testid': 'timeline-ruler-past-end' } })?.getAttribute('x'));
  return duration > 0 && x > 0 ? x / duration : DEFAULT_PIXELS_PER_SECOND;
}

/**
 * Zooms the timeline out, with its zoom button, until the first `seconds` of it
 * show without scrolling, so a drag can reach anywhere in them. Does nothing
 * when they already do (or when the screen cannot say, as in tests). The button
 * stops at the zoom that fits the whole project, so it also stops when a press
 * changes nothing: the span never fits (it runs past the project's end, or a
 * scrollbar takes some of the room), and more presses would only be spam.
 */
export async function fitSpan(ctx: DemoContext, L: Locators, seconds: number): Promise<void> {
  const viewport = query(L.timelineViewport);
  if (!viewport || viewport.clientWidth <= 0) return;
  const needed = () => seconds * pixelsPerSecond() + timelineGutterWidth(isPhoneLayout()) + EDGE_MARGIN;
  let zoom = pixelsPerSecond();
  for (let clicks = 0; needed() > viewport.clientWidth && clicks < MAX_ZOOM_CLICKS; clicks++) {
    if (!(await click(ctx, L.timelineZoomOut, { hold: false }))) return;
    await ctx.clock.wait(ctx.timing.afterClick * 0.4);
    const now = pixelsPerSecond();
    if (now >= zoom - ZOOM_EPSILON) return;
    zoom = now;
  }
}

/** Clicks the ruler at `time`, which puts the playhead there. False when the ruler cannot be found. */
export async function clickRulerAt(ctx: DemoContext, L: Locators, time: number): Promise<boolean> {
  const ruler = await find(ctx, L.timelineRuler);
  if (!ruler) return false;
  const { duration } = useProjectStore.getState();
  const at = (el: Element) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + Math.max(0, Math.min(duration, time)) * pixelsPerSecond(), y: rect.top + rect.height * 0.7 };
  };
  if (!(await moveTo(ctx, ruler, { at }))) return false;
  const point = ctx.cursor.position;
  ctx.cursor.setPressed(true);
  await ctx.clock.wait(90);
  ctx.clock.check();
  pressAndRelease(ruler, point);
  ctx.cursor.setPressed(false);
  await ctx.clock.wait(ctx.timing.afterClick);
  if (Math.abs(useProjectStore.getState().playheadTime - time) > 0.5) warn(`the ruler click landed at ${useProjectStore.getState().playheadTime.toFixed(2)}s, not ${time}s`);
  return true;
}
