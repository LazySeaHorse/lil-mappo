import { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { BoundaryItem } from '@/store/types';
import { BoundaryRenderer } from './runtime/BoundaryRenderer';

interface BoundaryLayerGroupProps {
  boundary: BoundaryItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}

/** Thin React adapter; BoundaryRenderer owns all Mapbox resources and updates. */
export function BoundaryLayerGroup({ boundary, mapRef, styleLoaded }: BoundaryLayerGroupProps) {
  const rendererRef = useRef<BoundaryRenderer | null>(null);
  const initialBoundaryRef = useRef(boundary);
  initialBoundaryRef.current = boundary;
  const active = boundary.resolveStatus === 'resolved' && boundary.geojson !== null;

  useEffect(() => {
    if (!styleLoaded || !active) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const renderer = new BoundaryRenderer(map, initialBoundaryRef.current);
    rendererRef.current = renderer;
    renderer.mount();

    return () => {
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [active, boundary.id, mapRef, styleLoaded]);

  useEffect(() => {
    rendererRef.current?.setBoundary(boundary);
  }, [boundary]);

  return null;
}
