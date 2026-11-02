import type { Map as MapboxMap } from 'mapbox-gl';
import { waitForMapIdle, type MapIdleResult, type WaitForMapIdleOptions } from './mapWait';

export type MapRenderWaitOptions = Pick<WaitForMapIdleOptions, 'timeoutMs' | 'extendWhileLoading' | 'signal'>;

export interface MapSceneRuntime {
  getMap(): MapboxMap;
  sync(): void;
  renderAt(time: number): void;
  /** Resolves `'timeout'` when the map did not go idle in time; the caller decides what that means. */
  waitUntilRendered(wait?: MapRenderWaitOptions): Promise<MapIdleResult>;
}

export function waitForMapRender(map: MapboxMap, { timeoutMs = 5_000, ...wait }: MapRenderWaitOptions = {}): Promise<MapIdleResult> {
  return waitForMapIdle(map, { timeoutMs, ...wait });
}
