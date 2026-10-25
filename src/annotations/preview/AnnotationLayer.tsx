/**
 * AnnotationLayer — the live editor's callouts.
 *
 * Callouts are drawn by one overlay canvas that follows the map's render loop
 * (see AnnotationOverlay); this component only mounts it on the map.
 */

import { useEffect } from 'react';
import { useMap } from 'react-map-gl/mapbox';
import { AnnotationOverlay } from './AnnotationOverlay';

/** The overlay canvas for the map this layer sits in. */
function useAnnotationOverlay(): void {
  const { current } = useMap();
  const map = current?.getMap();

  useEffect(() => {
    if (!map) return;
    const overlay = new AnnotationOverlay(map);
    overlay.mount();
    return () => overlay.dispose();
  }, [map]);
}

export function AnnotationLayer() {
  useAnnotationOverlay();
  return null;
}
