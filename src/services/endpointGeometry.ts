import { getDirections, type DirectionsResult } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { wrapGeometry } from '@/store/itemFactories';

export interface EndpointGeometry {
  geojson: GeoJSON.FeatureCollection;
  /** Set for car routes: the directions response the path came from. */
  directions?: DirectionsResult;
}

/**
 * The path of a car route (Mapbox Directions) or a flight (great-circle arc)
 * between two endpoints, as a route's FeatureCollection. A car route rejects
 * when the directions request fails or `signal` aborts it. A flight is pure
 * math and returns synchronously, so a mode switch can redraw it in the same
 * update instead of showing the old path for a tick.
 */
export function computeEndpointGeometry(
  mode: 'car' | 'flight',
  start: [number, number],
  end: [number, number],
  signal?: AbortSignal,
): EndpointGeometry | Promise<EndpointGeometry> {
  if (mode === 'car') {
    return getDirections(start, end, signal).then((directions) => ({
      geojson: wrapGeometry(directions.geometry),
      directions,
    }));
  }
  return { geojson: wrapGeometry(calculateFlightArc(start, end)) };
}
