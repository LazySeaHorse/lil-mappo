import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';
import { mapContainerSize } from '@/engine/mapFraming';

/**
 * A project's zooms and pixel sizes are measured on a video frame `frameWidth` pixels wide (see
 * `Project.frameWidth`). A map whose frame is another width shows them zoomed by
 * log2(its width / frameWidth), and pixel sizes (route widths, callouts) scaled by 2^that, so a
 * keyframe frames the same ground on any screen and at any export resolution.
 *
 * The frame is the map's layout width: the editor's map in the editor (fit mode scales the
 * layout down with CSS, which leaves this width alone), the target width while a capture or
 * export has the map resized to it.
 */
export function frameZoomOffset(frameWidthPx: number, frameWidth: number): number {
  return frameWidthPx > 0 && frameWidth > 0 ? Math.log2(frameWidthPx / frameWidth) : 0;
}

/**
 * The project's frame width. A project from before it was stored, until the map has measured it
 * (see `useProjectFrameWidth`), uses the map's own width, which is how it was shown then.
 */
export function projectFrameWidth(map: Pick<MapboxMap, 'getContainer'>): number {
  return useProjectStore.getState().frameWidth ?? mapContainerSize(map).width;
}

/** How far the map is zoomed from the project's zooms, at its current size. */
export function mapZoomOffset(map: Pick<MapboxMap, 'getContainer'>): number {
  return frameZoomOffset(mapContainerSize(map).width, projectFrameWidth(map));
}
