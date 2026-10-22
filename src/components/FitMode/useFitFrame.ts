import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/store/useProjectStore';
import { useResponsive } from '@/hooks/useResponsive';
import { visibleTimelineHeight } from '@/constants/layout';
import type { FrameLayout } from '@/engine/mapFraming';
import { fitFrame, type FitFrame } from '@/engine/viewFit';

/** Where fit mode shows the map: the whole full-screen map, scaled down into the video's frame. */
export interface FitFrameState {
  /** Fit mode is on and the frame has room between the panels. */
  active: boolean;
  /** The video frame in the editor's pixels. Null when not active. */
  frame: FitFrame | null;
  /** Frame width over editor width: how much smaller the map is shown. 1 when not active. */
  scale: number;
  /** The map's layout size in fit mode: the editor's full width, and that width shaped like the video. */
  mapWidth: number;
  mapHeight: number;
}

/**
 * Whether fit mode is on. Phones and the narrow layouts have no Fit button, and zen mode hides the
 * panels the frame sits between, so either turns it off. Shared by the frame and the app's theme.
 */
export function isFitModeOn(isFitMode: boolean, hideUI: boolean, isToolbarCollapsed: boolean): boolean {
  return isFitMode && !hideUI && !isToolbarCollapsed;
}

export const FULL_SCREEN: Readonly<FitFrameState> = { active: false, frame: null, scale: 1, mapWidth: 0, mapHeight: 0 };

/**
 * Fit mode's frame for an editor of `size`. The map keeps the editor's width, so a zoom means what
 * it means full screen, takes the video's aspect ratio for its height, and is scaled into the frame.
 */
export function fitFrameState(
  on: boolean,
  size: { width: number; height: number } | null,
  aspect: number,
  layout: FrameLayout,
  timelineHeight: number,
): FitFrameState {
  const frame = on && size ? fitFrame(size, aspect, layout, timelineHeight) : null;
  if (!size || !frame) return FULL_SCREEN;
  return { active: true, frame, scale: frame.width / size.width, mapWidth: size.width, mapHeight: size.width / aspect };
}

/**
 * Style for the element holding the map: full size in full screen; in fit mode the editor's width,
 * the video's shape, and scaled from its top left corner into the frame. Captures lift the scale
 * (see withTemporaryMapViewport), so they render as they would without fit mode.
 */
export function fitMapStyle(fit: FitFrameState, capturing: boolean): CSSProperties | undefined {
  if (!fit.active || !fit.frame) return undefined;
  return {
    width: fit.mapWidth,
    height: fit.mapHeight,
    transformOrigin: '0 0',
    transform: capturing ? 'none' : `translate(${fit.frame.x}px, ${fit.frame.y}px) scale(${fit.scale})`,
  };
}

/** Fit mode's frame for the editor area `ref` covers, kept up to date as it and the panels resize. */
export function useFitFrame(ref: RefObject<HTMLElement | null>): FitFrameState {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const { isFitMode, hideUI, resolution, timelineHeight } = useProjectStore(
    useShallow((s) => ({
      isFitMode: s.isFitMode,
      hideUI: s.hideUI,
      resolution: s.resolution,
      timelineHeight: visibleTimelineHeight(s.timelineHeight, s.itemOrder.length),
    })),
  );
  const { isMobile, isTablet, isToolbarCollapsed } = useResponsive();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((prev) => (
      prev && prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight }
    ));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  const on = isFitModeOn(isFitMode, hideUI, isToolbarCollapsed);
  const aspect = resolution[0] / resolution[1];
  return useMemo(
    () => fitFrameState(on, size, aspect, { isMobile, isTablet }, timelineHeight),
    [on, size, aspect, isMobile, isTablet, timelineHeight],
  );
}
