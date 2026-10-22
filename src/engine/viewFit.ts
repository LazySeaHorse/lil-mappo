import type { Map as MapboxMap } from 'mapbox-gl';
import { canMoveCamera, frameDuration, framePadding, type FrameLayout } from '@/engine/mapFraming';
import { getViewOffset, getViewPadding, setViewFit, type FitView } from '@/engine/viewOffset';

/** A rectangle in the map container's pixels. */
export interface FitFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The free area between the panels, as the fit card: the toolbar on top, the timeline below, the
 * inspector on the right and the screen edge on the left. Always sized as if the inspector is
 * open, so the card does not jump when the inspector toggles.
 */
export function fitCard(
  container: { width: number; height: number },
  layout: FrameLayout,
  timelineHeight: number,
): FitFrame | null {
  if (!(container.width > 0) || !(container.height > 0)) return null;
  const pad = framePadding(container, layout, { isInspectorOpen: true, timelineHeight });
  const width = container.width - pad.left - pad.right;
  const height = container.height - pad.top - pad.bottom;
  return width > 0 && height > 0 ? { x: pad.left, y: pad.top, width, height } : null;
}

/** The largest rectangle with the video's aspect ratio, centred in the card. */
export function fitFrame(
  container: { width: number; height: number },
  aspect: number,
  layout: FrameLayout,
  timelineHeight: number,
): FitFrame | null {
  const card = fitCard(container, layout, timelineHeight);
  if (!card || !(aspect > 0) || !Number.isFinite(aspect)) return null;
  const width = Math.min(card.width, card.height * aspect);
  const height = width / aspect;
  return { x: card.x + (card.width - width) / 2, y: card.y + (card.height - height) / 2, width, height };
}

/**
 * The camera shift that shows the full-screen framing, shrunk into `frame`. Exports render the
 * container's full width (cropped top and bottom to the video's aspect ratio), so scaling that
 * view by frame width / container width and centring it on the frame shows what the video holds.
 */
export function fitView(container: { width: number; height: number }, frame: FitFrame): FitView {
  const dx = 2 * (frame.x + frame.width / 2) - container.width;
  const dy = 2 * (frame.y + frame.height / 2) - container.height;
  return {
    offset: Math.log2(frame.width / container.width),
    padding: { left: Math.max(0, dx), right: Math.max(0, -dx), top: Math.max(0, dy), bottom: Math.max(0, -dy) },
  };
}

const PADDING_SIDES = ['top', 'bottom', 'left', 'right'] as const;

function sameView(a: FitView, b: FitView): boolean {
  return Math.abs(a.offset - b.offset) < 1e-9 && PADDING_SIDES.every((side) => Math.abs(a.padding[side] - b.padding[side]) < 1e-6);
}

/**
 * Moves the map into or out of fit mode: one easeTo of zoom and padding together, so the map
 * centre lands on the frame centre and the frame shows what full screen would export. A change
 * while fit mode stays on (a resize, a new aspect ratio) jumps instead of animating.
 */
export function moveToFitView(map: MapboxMap, view: FitView): void {
  const from: FitView = { offset: getViewOffset(), padding: getViewPadding() };
  if (sameView(from, view)) return;
  // Recorded as the move starts, so whatever reads the camera meanwhile takes off the target offset.
  setViewFit(view);
  const toggling = (from.offset === 0) !== (view.offset === 0);
  map.easeTo({
    zoom: map.getZoom() + view.offset - from.offset,
    padding: view.padding,
    duration: toggling && canMoveCamera() ? frameDuration() : 0,
  });
}
