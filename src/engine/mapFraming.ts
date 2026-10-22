import type { Map as MapboxMap, PaddingOptions } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { isGestureActive } from '@/store/history';
import { PANEL_GAP, PANEL_MARGIN, rightReserved, visibleTimelineHeight } from '@/constants/layout';
import { geojsonBounds } from '@/engine/geoUtils';
import type { MapCameraView } from '@/engine/readMapCamera';
import { getViewOffset, getViewPadding, toProjectZoom, toViewZoom } from '@/engine/viewOffset';

/** [west, south, east, north] */
export type FrameBox = [number, number, number, number];
export type FramePoint = [number, number];

/** Viewport class the floating panels depend on (from `useResponsive`). */
export interface FrameLayout {
  isMobile: boolean;
  isTablet: boolean;
}

export interface FrameOptions {
  /** Highest zoom a fit may reach. */
  maxZoom?: number;
  /** Zoom to use when a point has to be brought into view, if the map is zoomed out further. */
  minPointZoom?: number;
}

export const MAP_FRAME_MS = 800;
const TOOLBAR_HEIGHT = 56;
/** Share of the map that padding may take on one axis, so a small window still shows something. */
const MAX_PADDING_SHARE = 0.7;
const DEFAULT_MAX_ZOOM = 16;
const DEFAULT_MIN_POINT_ZOOM = 12;

/** Points and very small areas would zoom to the maximum; keep a sensible minimum span (~1 km). */
export function withMinimumSpan(b: FrameBox, span = 0.01): FrameBox {
  const [w, s, e, n] = b;
  const padX = Math.max(0, (span - (e - w)) / 2);
  const padY = Math.max(0, (span - (n - s)) / 2);
  return [w - padX, s - padY, e + padX, n + padY];
}

/** The camera stays where it is while it plays, scrubs, exports or the user drags something. */
export function canMoveCamera(): boolean {
  const s = useProjectStore.getState();
  return !(s.isPlaying || s.isScrubbing || s.isExporting || isGestureActive());
}

function fitAxis(before: number, after: number, size: number): [number, number] {
  const total = before + after;
  const limit = size * MAX_PADDING_SHARE;
  if (total <= limit || total === 0) return [before, after];
  const scale = limit / total;
  return [before * scale, after * scale];
}

/**
 * Padding that keeps framed content clear of the floating panels: the toolbar on
 * top, the timeline below and the inspector on the right.
 */
export function framePadding(
  container: { width: number; height: number },
  layout: FrameLayout,
  ui: { isInspectorOpen: boolean; timelineHeight: number },
): PaddingOptions {
  const right = rightReserved({ isInspectorOpen: ui.isInspectorOpen, isMobile: layout.isMobile, isTablet: layout.isTablet });
  // The timeline is hidden while the inspector drawer covers a phone.
  const timeline = layout.isMobile && ui.isInspectorOpen ? container.height / 2 : ui.timelineHeight + PANEL_MARGIN;
  const [top, bottom] = fitAxis(PANEL_MARGIN + TOOLBAR_HEIGHT + PANEL_GAP, timeline + PANEL_GAP, container.height);
  const [left, rightPad] = fitAxis(PANEL_MARGIN, right, container.width);
  return { top, bottom, left, right: rightPad };
}

/** Duration of a camera move; none when the user asks for reduced motion. */
export function frameDuration(): number {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : MAP_FRAME_MS;
  } catch {
    return MAP_FRAME_MS;
  }
}

/** Inset that keeps content off the edge of the fit frame, as the panel margin does in full screen. */
const FIT_INSET = 24;

/**
 * The free area to frame things in: between the panels, or in fit mode inside the frame, which
 * is where the map's own padding already puts the centre.
 */
function currentPadding(map: MapboxMap, layout: FrameLayout): PaddingOptions {
  const { width, height } = map.getContainer().getBoundingClientRect();
  if (getViewOffset() !== 0) {
    const fit = getViewPadding();
    return { top: fit.top + FIT_INSET, bottom: fit.bottom + FIT_INSET, left: fit.left + FIT_INSET, right: fit.right + FIT_INSET };
  }
  const { isInspectorOpen, timelineHeight, itemOrder } = useProjectStore.getState();
  return framePadding({ width, height }, layout, {
    isInspectorOpen,
    timelineHeight: visibleTimelineHeight(timelineHeight, itemOrder.length),
  });
}

/**
 * The easeTo offset that moves the map's centre to the middle of the free area. The offset is
 * measured from the padded centre the map already holds, which is the frame's in fit mode.
 */
function freeAreaOffset(map: MapboxMap, padding: PaddingOptions): [number, number] {
  const held = map.getPadding?.() ?? { top: 0, bottom: 0, left: 0, right: 0 };
  return [(padding.left - padding.right - (held.left - held.right)) / 2, (padding.top - padding.bottom - (held.top - held.bottom)) / 2];
}

/** Fits the map to a box with room for the panels. Returns false when the camera must not move. */
export function frameBox(map: MapboxMap, box: FrameBox, layout: FrameLayout, options: FrameOptions = {}): boolean {
  if (!canMoveCamera()) return false;
  const [w, s, e, n] = withMinimumSpan(box);
  map.fitBounds([[w, s], [e, n]], {
    padding: currentPadding(map, layout),
    // The padding only places the fit; kept on the camera it would shift every later view.
    retainPadding: false,
    maxZoom: options.maxZoom ?? DEFAULT_MAX_ZOOM,
    duration: frameDuration(),
  });
  return true;
}

/**
 * Eases the map to a point. A point that already sits inside the free area of the
 * map does not move it.
 */
export function framePoint(map: MapboxMap, point: FramePoint, layout: FrameLayout, options: FrameOptions = {}): boolean {
  if (!canMoveCamera()) return false;
  const padding = currentPadding(map, layout);
  const { width, height } = map.getContainer().getBoundingClientRect();
  const { x, y } = map.project(point);
  const inside = x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom;
  if (inside) return false;
  map.easeTo({
    center: point,
    zoom: toViewZoom(Math.max(toProjectZoom(map.getZoom()), options.minPointZoom ?? DEFAULT_MIN_POINT_ZOOM)),
    // An offset, not `padding`: easeTo keeps padding on the camera, which would shift every later view.
    offset: freeAreaOffset(map, padding),
    duration: frameDuration(),
  });
  return true;
}

/** Earth's circumference at the equator in metres, as mapbox measures it. */
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137;
/** Share of the free area's shorter side a framed 3D model takes. */
const MODEL_FRAME_SHARE = 0.35;
/** Closest a framed 3D model brings the map, short of mapbox's limit. */
const MODEL_MAX_ZOOM = 20;

/** The zoom at which `meters` cover `pixels` on screen at latitude `lat` (mapbox's 512 px tiles). */
export function zoomForMeters(meters: number, pixels: number, lat: number): number {
  return Math.log2((EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180) * pixels) / (512 * meters));
}

/**
 * Eases the map to a 3D model standing at `point`, zoomed so its size (`sizeM`, metres as drawn)
 * takes about a third of the free area: in for a small model, out for a big one.
 */
export function frameModel(map: MapboxMap, point: FramePoint, sizeM: number, layout: FrameLayout): boolean {
  if (!canMoveCamera() || !(sizeM > 0)) return false;
  const padding = currentPadding(map, layout);
  const { width, height } = map.getContainer().getBoundingClientRect();
  const free = Math.max(1, Math.min(width - padding.left - padding.right, height - padding.top - padding.bottom));
  const zoom = zoomForMeters(sizeM, free * MODEL_FRAME_SHARE, point[1]);
  map.easeTo({
    center: point,
    zoom: Math.min(MODEL_MAX_ZOOM, Math.max(0, zoom)),
    offset: freeAreaOffset(map, padding),
    duration: frameDuration(),
  });
  return true;
}

/** Frames any GeoJSON: a lone point eases, everything else fits. False if there is nothing to frame. */
export function frameGeometry(map: MapboxMap, geojson: GeoJSON.GeoJSON, layout: FrameLayout, options: FrameOptions = {}): boolean {
  const bounds = geojsonBounds(geojson);
  if (!bounds) return false;
  const [[w, s], [e, n]] = bounds;
  if (w === e && s === n) return framePoint(map, [w, s], layout, options);
  return frameBox(map, [w, s, e, n], layout, options);
}

/**
 * Eases the map to a stored camera view, such as a camera view in the timeline.
 * The view fills the whole map, as it does in the video, so there is no panel offset; in fit mode
 * it fills the frame, which is where the map's padding puts the centre.
 * Returns false when the camera must not move.
 */
export function moveToCamera(map: MapboxMap, view: MapCameraView): boolean {
  if (!canMoveCamera()) return false;
  map.easeTo({
    center: view.center,
    zoom: toViewZoom(view.zoom),
    pitch: view.pitch,
    bearing: view.bearing,
    duration: frameDuration(),
  });
  return true;
}
