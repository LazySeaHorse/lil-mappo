import { createContext, useContext } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';

/**
 * Shared context so the Toolbar (for camera KF capture) and usePlayback
 * can access the same underlying Mapbox map instance that lives inside
 * <MapViewport>.
 */
export const MapRefContext = createContext<React.MutableRefObject<MapRef | null>>({ current: null });

export function useMapRef() {
  return useContext(MapRefContext);
}
