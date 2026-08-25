import { createContext, useContext } from 'react';
import type { MutableRefObject } from 'react';
import type { MapSceneRuntime } from '@/components/MapViewport/runtime/MapSceneRuntime';

export type MapSceneRuntimeRef = MutableRefObject<MapSceneRuntime | null>;

export const MapRuntimeContext = createContext<MapSceneRuntimeRef>({ current: null });

export function useMapRuntime(): MapSceneRuntimeRef {
  return useContext(MapRuntimeContext);
}
