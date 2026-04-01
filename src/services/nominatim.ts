export interface NominatimResult {
  display_name: string;
  type: string;
  geojson: GeoJSON.Geometry;
}

export async function searchBoundary(query: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=geojson&polygon_geojson=1&limit=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MapStudio/1.0' },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = await res.json();

  return (data.features || [])
    .filter((f: any) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f: any) => ({
      display_name: f.properties?.display_name || query,
      type: f.properties?.type || 'unknown',
      geojson: f.geometry,
    }));
}
