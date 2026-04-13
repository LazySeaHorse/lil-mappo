import { useEffect, useRef, useMemo } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { CalloutItem } from '@/store/types';

/**
 * Compute altitude offsets for callouts based on map zoom.
 * Updates only when map zoom/center changes, not on every playhead frame.
 */
export function useCalloutAltitudeOffsets(
  mapRef: React.MutableRefObject<MapRef | null>,
  callouts: CalloutItem[]
): Record<string, number> {
  const zoomRef = useRef<number | null>(null);
  const offsetsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const handleZoomChange = () => {
      const newZoom = map.getZoom();
      if (zoomRef.current === newZoom) return;

      zoomRef.current = newZoom;
      const newOffsets: Record<string, number> = {};

      for (const callout of callouts) {
        if (callout.altitude > 0) {
          const metersPerPixel =
            (156543.03392 * Math.cos((callout.lngLat[1] * Math.PI) / 180)) / Math.pow(2, newZoom);
          let offset = callout.altitude / metersPerPixel;
          offset = Math.min(offset, 300);
          newOffsets[callout.id] = offset;
        } else {
          newOffsets[callout.id] = 0;
        }
      }

      offsetsRef.current = newOffsets;
    };

    // Initial calculation
    handleZoomChange();

    map.on('zoom', handleZoomChange);
    map.on('move', handleZoomChange);

    return () => {
      map.off('zoom', handleZoomChange);
      map.off('move', handleZoomChange);
    };
  }, [mapRef, callouts]);

  return offsetsRef.current;
}
