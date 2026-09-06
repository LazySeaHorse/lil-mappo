import type { Map as MapboxMap } from 'mapbox-gl';
import { waitForMapIdle } from './mapWait';

export interface MapSceneRuntime {
  getMap(): MapboxMap;
  sync(): void;
  renderAt(time: number): void;
  waitUntilRendered(timeoutMs?: number): Promise<void>;
}

export async function waitForMapRender(map: MapboxMap, timeoutMs = 5_000): Promise<void> {
  await waitForMapIdle(map, { timeoutMs });
}
