import { resolveLocation } from '@/agent/geocode';
import { createCoordinateAirport, parseCoordinates } from '@/hooks/useAirportSearch';
import { getAirportByCode, loadAirports, searchAirportsSync } from '@/services/airports/airportService';

export interface ResolvedEntry {
  point: [number, number];
  name: string;
}

/**
 * Finds the place a typed or pasted entry means, the way the place fields do: a flight takes
 * coordinates, an airport code (IATA or ICAO), or the best airport or city match; a car takes
 * coordinates or the first geocoding result. Resolves to null when nothing matches.
 */
export async function resolvePlace(mode: 'car' | 'flight', text: string): Promise<ResolvedEntry | null> {
  try {
    if (mode === 'flight') {
      await loadAirports();
      const coords = parseCoordinates(text);
      const airport = coords ? createCoordinateAirport(coords) : getAirportByCode(text) ?? searchAirportsSync(text, 1)[0];
      return airport ? { point: airport.coordinates, name: airport.name } : null;
    }
    const place = await resolveLocation(text);
    return { point: place.coordinates, name: place.name ?? '' };
  } catch {
    return null;
  }
}
