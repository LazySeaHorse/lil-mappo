import { getEffectiveMapboxToken } from '@/config/mapbox';
import { truncateCoordinates } from '@/engine/geoUtils';

export interface DirectionsResult {
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
}

export async function getDirections(
  start: [number, number],
  end: [number, number],
  mode: 'car' | 'walk',
  signal?: AbortSignal
): Promise<DirectionsResult> {
  const profile = mode === 'car' ? 'driving-traffic' : 'walking';
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?access_token=${getEffectiveMapboxToken()}&geometries=geojson&overview=full`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Mapbox Directions error: ${res.status}`);
    const data = await res.json();
    
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    return {
      geometry: truncateCoordinates(route.geometry, 4),
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    console.error('Directions error:', error);
    throw error;
  }
}

