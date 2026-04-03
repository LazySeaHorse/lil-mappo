import { MAPBOX_TOKEN } from '@/config/mapbox';

export interface DirectionsResult {
  geometry: GeoJSON.LineString;
  distance: number;
  duration: number;
}

export async function getDirections(
  start: [number, number],
  end: [number, number],
  mode: 'car' | 'walk'
): Promise<DirectionsResult> {
  const profile = mode === 'car' ? 'driving-traffic' : 'walking';
  const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox Directions error: ${res.status}`);
    const data = await res.json();
    
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    return {
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
    };
  } catch (error) {
    console.error('Directions error:', error);
    throw error;
  }
}
