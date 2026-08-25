import { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
import type { RouteItem } from '@/store/types';
import { RouteRenderer } from './runtime/RouteRenderer';

interface RouteLayerGroupProps {
  route: RouteItem;
  mapRef: React.MutableRefObject<MapRef | null>;
  styleLoaded: boolean;
}

/** Thin React adapter; RouteRenderer owns all Mapbox resources and updates. */
export function RouteLayerGroup({ route, mapRef, styleLoaded }: RouteLayerGroupProps) {
  const rendererRef = useRef<RouteRenderer | null>(null);
  const initialRouteRef = useRef(route);
  initialRouteRef.current = route;

  useEffect(() => {
    if (!styleLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const renderer = new RouteRenderer(map, initialRouteRef.current);
    rendererRef.current = renderer;
    renderer.mount();

    return () => {
      renderer.dispose();
      if (rendererRef.current === renderer) rendererRef.current = null;
    };
  }, [mapRef, route.id, styleLoaded]);

  useEffect(() => {
    rendererRef.current?.setRoute(route);
  }, [route]);

  return null;
}
