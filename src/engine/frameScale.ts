import type { Map as MapboxMap } from 'mapbox-gl';
import { useProjectStore } from '@/store/useProjectStore';

/**
 * A project's zooms and pixel sizes are measured on a video frame `frameWidth` pixels wide (see
 * `Project.frameWidth`). A map whose frame is another width shows them zoomed by
 * log2(its width / frameWidth), and pixel sizes (route widths, callouts) scaled by 2^that, so a
 * keyframe frames the same ground on any screen and at any export resolution.
 *
 * The frame is the largest rectangle of the video's shape that fits the map (see `mapFrameSize`).
 */
export function frameZoomOffset(frameWidthPx: number, frameWidth: number): number {
  return frameWidthPx > 0 && frameWidth > 0 ? Math.log2(frameWidthPx / frameWidth) : 0;
}

/**
 * The video frame as the map shows it: the largest rectangle of the project's shape that fits the
 * map's layout size (fit mode's CSS scale leaves that alone, see `mapContainerSize`). Fit mode
 * shapes the map like the video and a capture sizes it to the frame, so there it is the whole map;
 * zen mode and the full-screen editor show more map around it. Fitting inside matches the follow
 * camera, which keeps the frame's height in view whatever the map's width.
 */
export function mapFrameSize(map: Pick<MapboxMap, 'getContainer'>): { width: number; height: number } {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const [videoWidth, videoHeight] = useProjectStore.getState().resolution;
  if (!(height > 0) || !(videoWidth > 0) || !(videoHeight > 0)) return { width, height };
  const aspect = videoWidth / videoHeight;
  return width / height > aspect ? { width: height * aspect, height } : { width, height: width / aspect };
}

const mapWidth = (map: Pick<MapboxMap, 'getContainer'>) => mapFrameSize(map).width;

/**
 * The project's frame width. A project from before it was stored, until MapViewport adopts the
 * map's frame width for it, uses that width, so it shows as it did then.
 */
export function projectFrameWidth(map: Pick<MapboxMap, 'getContainer'>): number {
  return useProjectStore.getState().frameWidth ?? mapWidth(map);
}

/** How far the map is zoomed from the project's zooms, at its current size. */
export function mapZoomOffset(map: Pick<MapboxMap, 'getContainer'>): number {
  return frameZoomOffset(mapWidth(map), projectFrameWidth(map));
}

/** The map's zoom as the project measures it: what a keyframe or callout set from this view stores. */
export function projectZoomOf(map: Pick<MapboxMap, 'getContainer' | 'getZoom'>): number {
  return map.getZoom() - mapZoomOffset(map);
}
