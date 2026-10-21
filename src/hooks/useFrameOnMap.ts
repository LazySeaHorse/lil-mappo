import { useMemo } from 'react';
import { useMapRef } from '@/hooks/useMapRef';
import { useResponsive } from '@/hooks/useResponsive';
import { frameGeometry, frameModel, framePoint, type FramePoint } from '@/engine/mapFraming';

/**
 * Moves the map to show something that was just added or changed, clear of the
 * toolbar, timeline and inspector. Does nothing without a map, and never moves
 * the camera while the project plays, scrubs or exports.
 */
export function useFrameOnMap() {
  const mapRef = useMapRef();
  const { isMobile, isTablet } = useResponsive();

  return useMemo(() => {
    const layout = { isMobile, isTablet };
    return {
      frameGeometry: (geojson: GeoJSON.GeoJSON) => {
        const map = mapRef.current?.getMap?.();
        if (map) frameGeometry(map, geojson, layout);
      },
      framePoint: (point: FramePoint) => {
        const map = mapRef.current?.getMap?.();
        if (map) framePoint(map, point, layout);
      },
      frameModel: (point: FramePoint, sizeM: number) => {
        const map = mapRef.current?.getMap?.();
        if (map) frameModel(map, point, sizeM, layout);
      },
    };
  }, [mapRef, isMobile, isTablet]);
}
