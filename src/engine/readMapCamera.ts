import type { Map as MapboxMap } from 'mapbox-gl';
import { toProjectZoom } from '@/engine/viewOffset';

/** The part of a camera that a user sets by moving the map. */
export interface MapCameraView {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/** A view of the whole world, used when there is no map to read. */
export const DEFAULT_MAP_CAMERA: Readonly<MapCameraView> = {
  center: [0, 20],
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

/**
 * Reads the live camera from the map, as the project stores it: in fit mode the map is zoomed out
 * to fit the video in its frame, and that is taken off. Without a map it returns the world view.
 */
export function readMapCamera(map: Pick<MapboxMap, 'getCenter' | 'getZoom' | 'getPitch' | 'getBearing'> | null | undefined): MapCameraView {
  if (!map) return { ...DEFAULT_MAP_CAMERA, center: [...DEFAULT_MAP_CAMERA.center] };
  const c = map.getCenter();
  return { center: [c.lng, c.lat], zoom: toProjectZoom(map.getZoom()), pitch: map.getPitch(), bearing: map.getBearing() };
}
