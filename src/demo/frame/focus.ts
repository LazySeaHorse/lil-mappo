import type { DemoFocusIntent, DemoRect } from '../protocol';
import type { DemoContext } from './actions';

/**
 * Where the run is working, for the shell's auto zoom. The primitives report the part of the app a
 * control belongs to (its panel, dialog or timeline), not the control, so the camera frames what is
 * being worked on and stays put while the cursor moves around inside it.
 */

export interface DemoFocus {
  /** In the frame's CSS px; null asks the camera to look at the whole stage. */
  rect: DemoRect | null;
  intent: DemoFocusIntent;
}

/** Regions of the app, innermost first: the first one an element sits in is its region. */
const REGIONS: { selector: string; intent: DemoFocusIntent }[] = [
  { selector: '[role="dialog"]', intent: 'work' },
  { selector: '[role="menu"]', intent: 'work' },
  { selector: '[role="listbox"]', intent: 'work' },
  { selector: '[data-walkthrough="timeline-panel"]', intent: 'wide' },
  { selector: '[data-section]', intent: 'work' },
  { selector: '[data-walkthrough="inspector-panel"]', intent: 'work' },
];

const INSPECTOR_PANEL = '[data-walkthrough="inspector-panel"]';

const toRect = (r: { left: number; top: number; right: number; bottom: number }): DemoRect => ({
  x: r.left,
  y: r.top,
  width: Math.max(0, r.right - r.left),
  height: Math.max(0, r.bottom - r.top),
});

function intersect(a: DOMRect | DemoBox, b: DOMRect | DemoBox) {
  return { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
}

type DemoBox = { left: number; top: number; right: number; bottom: number };

/**
 * The region of the app the element belongs to: its dialog, popup menu, the timeline, its inspector
 * section (only the part the panel shows), the inspector panel; otherwise the element itself.
 * Always clipped to the window. Null when it has no size on screen.
 */
export function focusFor(el: Element): DemoFocus | null {
  const win = el.ownerDocument.defaultView;
  const view: DemoBox = { left: 0, top: 0, right: win?.innerWidth ?? Infinity, bottom: win?.innerHeight ?? Infinity };
  let region: Element = el;
  let intent: DemoFocusIntent = 'work';
  for (const candidate of REGIONS) {
    const found = el.closest(candidate.selector);
    if (found) {
      region = found;
      intent = candidate.intent;
      break;
    }
  }
  let clipped = intersect(region.getBoundingClientRect(), view);
  // A section scrolled half out of the panel: only what the panel shows counts.
  const panel = region !== el && region.matches('[data-section]') ? region.closest(INSPECTOR_PANEL) : null;
  if (panel) clipped = intersect(clipped, panel.getBoundingClientRect());
  const rect = toRect(clipped);
  return rect.width > 0 && rect.height > 0 ? { rect, intent } : null;
}

/** Tells the shell the run is working around this element. */
export function focusOn(ctx: DemoContext, el: Element): void {
  if (ctx.focusHold) return;
  const focus = focusFor(el);
  if (focus) ctx.focus?.(focus);
}

/** Tells the shell to look at the whole stage (the map is the subject, or nothing in particular). */
export function focusOut(ctx: DemoContext): void {
  ctx.focus?.({ rect: null, intent: 'work' });
}

/**
 * Runs `fn` with the camera on the whole stage: nothing inside it moves the camera in (the map is
 * the subject). Nests; the camera is free again when the outermost one ends.
 */
export async function withFocusOut<T>(ctx: DemoContext, fn: () => Promise<T>): Promise<T> {
  ctx.focusHold = (ctx.focusHold ?? 0) + 1;
  focusOut(ctx);
  try {
    return await fn();
  } finally {
    ctx.focusHold = (ctx.focusHold ?? 1) - 1;
  }
}
