import type { Map as MapboxMap } from 'mapbox-gl';

export interface MapSceneRuntime {
  getMap(): MapboxMap;
  sync(): void;
  renderAt(time: number): void;
  waitUntilRendered(timeoutMs?: number): Promise<void>;
}

export function waitForMapRender(map: MapboxMap, timeoutMs = 5_000): Promise<void> {
  if (map.loaded()) {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  return Promise.race([
    new Promise<void>((resolve) => {
      map.once('idle', () => requestAnimationFrame(() => resolve()));
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
