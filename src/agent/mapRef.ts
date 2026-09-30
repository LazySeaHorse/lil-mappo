import type { MutableRefObject } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapSceneRuntime } from '@/components/MapViewport/runtime/MapSceneRuntime';

/**
 * The agent layer runs outside React, so the editor registers the live map
 * (and the scene runtime that syncs layers to the playhead) here.
 */

let mapRef: MutableRefObject<MapRef | null> | null = null;
let runtimeRef: MutableRefObject<MapSceneRuntime | null> | null = null;

export function setAgentMapRef(ref: MutableRefObject<MapRef | null> | null): void {
  mapRef = ref;
}

export function setAgentRuntimeRef(ref: MutableRefObject<MapSceneRuntime | null> | null): void {
  runtimeRef = ref;
}

/** The live Mapbox map, or null until the editor has mounted and loaded it. */
export function getAgentMap(): MapboxMap | null {
  return (mapRef?.current?.getMap?.() as MapboxMap | undefined) ?? null;
}

export function getAgentRuntime(): MapSceneRuntime | null {
  return runtimeRef?.current ?? null;
}
