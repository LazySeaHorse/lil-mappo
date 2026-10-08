import { truncateCoordinates } from '@/engine/geoUtils';

/** Search results keep the raw outline; the chosen detail level is applied when a boundary is added (see boundaryDetail). */
export interface NominatimResult {
  display_name: string;
  type: string;
  geojson: GeoJSON.Geometry;
  /** Lowercase ISO 3166-1 alpha-2 code for countries (and some dependent territories); null otherwise. */
  countryCode: string | null;
}

interface NominatimProperties {
  display_name?: string;
  type?: string;
  extratags?: Record<string, string> | null;
}

/** Reads the country code from the OSM `ISO3166-1` extratags, lowercased; null when absent or malformed. */
export function parseCountryCode(extratags: Record<string, string> | null | undefined): string | null {
  const raw = extratags?.['ISO3166-1:alpha2'] ?? extratags?.['ISO3166-1'];
  const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[a-z]{2}$/.test(code) ? code : null;
}

export async function searchBoundary(query: string, signal?: AbortSignal): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=geojson&polygon_geojson=1&extratags=1&limit=5`;
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'MapStudio/1.0' },
  });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = (await res.json()) as GeoJSON.FeatureCollection<GeoJSON.Geometry, NominatimProperties>;

  return (data.features || [])
    .filter((f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, NominatimProperties> =>
      Boolean(f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    )
    .map((f) => ({
      display_name: f.properties?.display_name || query,
      type: f.properties?.type || 'unknown',
      geojson: truncateCoordinates(f.geometry, 6),
      countryCode: parseCountryCode(f.properties?.extratags),
    }));
}

