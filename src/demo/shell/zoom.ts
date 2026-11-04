import type { DemoFocusIntent } from '../protocol';
import type { Box } from './layout';

/**
 * The auto zoom's director, as pure maths: where the camera looks, given where the run says it is
 * working. The frame says where to look (`focus` messages); the shell moves the camera, as ONE
 * transform on everything on the stage: `translate(x, y) scale(scale)` from the stage's top left.
 *
 * Tuning knobs are the exported constants below.
 */

/** Extra room around the focused region, as a share of its size on each side. */
export const ZOOM_PADDING = 0.12;
/** A region smaller than this share of the app's viewport is grown to it (a lone button is not worth filling the screen). */
export const MIN_REGION_SHARE = 0.3;
/** The most a wide strip (the timeline) is magnified, whatever the max zoom. */
export const WIDE_MAX_ZOOM = 1.3;
/** A region this close to the visible area's edge (as a share of the visible size) counts as leaving it. */
export const HYSTERESIS_MARGIN = 0.06;
/** A pan keeps the current scale when the fitting scale is within this factor of it. */
export const SIMILAR_SCALE = 1.2;
/** The camera eases back to 1x after this long without a focus (ms, before the speed multiplier). */
export const IDLE_MS = 1500;
/** One camera move (ms, divided by the speed). */
export const TRANSITION_MS = 700;

export interface ZoomView {
  /** 1 = the whole stage. */
  scale: number;
  /** CSS translate in stage px: 0 at 1x, down to `stage * (1 - scale)` when zoomed. */
  x: number;
  y: number;
}

export const IDENTITY_VIEW: ZoomView = { scale: 1, x: 0, y: 0 };

export interface ZoomSpace {
  stage: { width: number; height: number };
  /** The app's viewport in stage px: sizes the minimum region. */
  viewport: Box;
  maxZoom: number;
}

export interface DirectorState {
  view: ZoomView;
  /** When the last focus arrived (ms); null when the camera is out or has never been told. */
  lastFocusAt: number | null;
}

export const INITIAL_DIRECTOR: DirectorState = { view: IDENTITY_VIEW, lastFocusAt: null };

export const isIdentity = (v: ZoomView) => v.scale === 1 && v.x === 0 && v.y === 0;

/** The view with its scale at least 1 and its translate keeping the stage fully covered. */
export function clampView(view: ZoomView, stage: ZoomSpace['stage']): ZoomView {
  const scale = Math.max(1, view.scale);
  return {
    scale,
    x: Math.min(0, Math.max(stage.width * (1 - scale), view.x)),
    y: Math.min(0, Math.max(stage.height * (1 - scale), view.y)),
  };
}

/** The part of the stage a view shows, in stage px. */
export function visibleBox(view: ZoomView, stage: ZoomSpace['stage']): Box {
  return { left: -view.x / view.scale, top: -view.y / view.scale, width: stage.width / view.scale, height: stage.height / view.scale };
}

/** The view that centres `point` at `scale`, kept inside the stage. */
function viewCentredOn(point: { x: number; y: number }, scale: number, stage: ZoomSpace['stage']): ZoomView {
  return clampView({ scale, x: stage.width / 2 - point.x * scale, y: stage.height / 2 - point.y * scale }, stage);
}

/** The region grown to the minimum share of the viewport (about its centre), then padded. */
function paddedRegion(region: Box, space: ZoomSpace): Box {
  const minW = space.viewport.width * MIN_REGION_SHARE;
  const minH = space.viewport.height * MIN_REGION_SHARE;
  const width = Math.max(region.width, minW);
  const height = Math.max(region.height, minH);
  const cx = region.left + region.width / 2;
  const cy = region.top + region.height / 2;
  const w = width * (1 + ZOOM_PADDING * 2);
  const h = height * (1 + ZOOM_PADDING * 2);
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h };
}

/** The scale at which the padded region fills the stage, between 1 and the cap. */
function fitScale(padded: Box, space: ZoomSpace, cap: number): number {
  const fit = Math.min(space.stage.width / Math.max(1, padded.width), space.stage.height / Math.max(1, padded.height));
  return Math.min(cap, Math.max(1, fit));
}

const capFor = (intent: DemoFocusIntent, maxZoom: number) => (intent === 'wide' ? Math.min(maxZoom, WIDE_MAX_ZOOM) : maxZoom);

/** Whether the box sits inside the visible area, with the hysteresis margin to spare on every side. */
function comfortablyInside(box: Box, visible: Box): boolean {
  const mx = visible.width * HYSTERESIS_MARGIN;
  const my = visible.height * HYSTERESIS_MARGIN;
  return (
    box.left >= visible.left + mx &&
    box.top >= visible.top + my &&
    box.left + box.width <= visible.left + visible.width - mx &&
    box.top + box.height <= visible.top + visible.height - my
  );
}

/**
 * The view for a region of the stage. Already comfortably in view at about the right zoom: the view
 * stays (no jitter between clicks in one panel). Out of view: pan, keeping the scale when it is
 * close to the one that fits.
 */
export function viewForRegion(current: ZoomView, region: Box, intent: DemoFocusIntent, space: ZoomSpace): ZoomView {
  const padded = paddedRegion(region, space);
  const fit = fitScale(padded, space, capFor(intent, space.maxZoom));
  const visible = visibleBox(current, space.stage);
  // In view and not worth magnifying further: stay put.
  if (comfortablyInside(region, visible) && fit <= current.scale * SIMILAR_SCALE) return current;
  const keep = current.scale <= fit && current.scale * SIMILAR_SCALE >= fit;
  const scale = keep ? current.scale : fit;
  return viewCentredOn({ x: padded.left + padded.width / 2, y: padded.top + padded.height / 2 }, scale, space.stage);
}

export interface FocusEvent {
  /** In stage px; null asks for the whole stage. */
  region: Box | null;
  intent: DemoFocusIntent;
}

/** The director's answer to a focus from the frame. */
export function directFocus(state: DirectorState, focus: FocusEvent, now: number, space: ZoomSpace): DirectorState {
  if (!focus.region) return { view: IDENTITY_VIEW, lastFocusAt: null };
  return { view: viewForRegion(state.view, focus.region, focus.intent, space), lastFocusAt: now };
}

/** Ms until the camera should ease out on its own, or null when it is out or waiting on nothing. */
export function idleDelay(state: DirectorState, now: number): number | null {
  if (state.lastFocusAt === null || isIdentity(state.view)) return null;
  return Math.max(0, state.lastFocusAt + IDLE_MS - now);
}

/** Time has passed with no focus: back to the whole stage once the idle delay is up. */
export function directIdle(state: DirectorState, now: number): DirectorState {
  return idleDelay(state, now) === 0 ? INITIAL_DIRECTOR : state;
}

/**
 * Mock AI mode: while the prompt is typed the camera looks at the top of the terminal (where the
 * input box is), otherwise at the whole stage. A terminal as wide as the stage (the portrait
 * layout) leaves nothing to magnify, so that stays at 1x.
 */
export function terminalView(terminal: Box, space: ZoomSpace): ZoomView {
  const { stage } = space;
  const region = { ...terminal, height: Math.min(terminal.height, (terminal.width * stage.height) / Math.max(1, stage.width)) };
  const padded = { ...region, left: region.left - region.width * ZOOM_PADDING, top: region.top - region.height * ZOOM_PADDING, width: region.width * (1 + ZOOM_PADDING * 2), height: region.height * (1 + ZOOM_PADDING * 2) };
  const scale = fitScale(padded, space, space.maxZoom);
  return viewCentredOn({ x: region.left + region.width / 2, y: region.top + region.height / 2 }, scale, stage);
}

/** The CSS for a view: the transform and how long it takes to get there. */
export function viewStyle(view: ZoomView, { speed, instant }: { speed: number; instant: boolean }): { transform: string; transitionDuration: string } {
  return {
    transform: isIdentity(view) ? 'none' : `translate(${view.x.toFixed(2)}px, ${view.y.toFixed(2)}px) scale(${view.scale.toFixed(4)})`,
    transitionDuration: instant ? '0ms' : `${Math.round(TRANSITION_MS / Math.max(0.1, speed))}ms`,
  };
}

export interface CameraInput {
  autoZoom: boolean;
  mockAi: boolean;
  /** Mock AI mode: the prompt is being typed into the terminal. */
  aiTyping: boolean;
  director: DirectorState;
  terminal: Box;
  space: ZoomSpace;
}

/**
 * Where the camera looks. Off: the whole stage. Mock AI mode: the terminal while the prompt is
 * typed, then the whole stage for the rest of the run (the frame's focus is ignored). Otherwise
 * the director's view.
 */
export function cameraView({ autoZoom, mockAi, aiTyping, director, terminal, space }: CameraInput): ZoomView {
  if (!autoZoom) return IDENTITY_VIEW;
  if (mockAi) return aiTyping ? terminalView(terminal, space) : IDENTITY_VIEW;
  return director.view;
}
