import { MAPBOX_TOKEN } from '@/config/mapbox';
import type { SearchResult } from '@/store/types';

export async function searchPlaces(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=10&types=place,address,poi,neighborhood,locality,country,region`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox error: ${res.status}`);
    const data = await res.json();
    
    return (data.features || []).map((f: any) => ({
      id: f.id,
      name: f.place_name,
      lngLat: f.center as [number, number],
      category: f.properties?.category || f.place_type[0] || 'place',
    }));
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
}
