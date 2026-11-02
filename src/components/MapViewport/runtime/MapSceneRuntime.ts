import type { Map as MapboxMap } from 'mapbox-gl';
import { waitForMapIdle, type MapIdleResult } from './mapWait';

export interface MapSceneRuntime {
  getMap(): MapboxMap;
  sync(): void;
  renderAt(time: number): void;
  /** Resolves `'timeout'` when the map did not go idle in time; the caller decides what that means. */
  waitUntilRendered(timeoutMs?: number): Promise<MapIdleResult>;
}

export function waitForMapRender(map: MapboxMap, timeoutMs = 5_000): Promise<MapIdleResult> {
  return waitForMapIdle(map, { timeoutMs });
}
