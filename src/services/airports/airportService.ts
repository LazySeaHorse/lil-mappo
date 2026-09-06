import type { Airport, RawAirportTuple } from './types';

let cachedAirports: Airport[] | null = null;
let iataIndex: Map<string, Airport> | null = null;
let icaoIndex: Map<string, Airport> | null = null;
let loadPromise: Promise<Airport[]> | null = null;

export const POPULAR_AIRPORT_CODES = [
  'JFK', 'LHR', 'CDG', 'HND', 'DXB', 'SIN', 'AMS', 'FRA',
  'LAX', 'ORD', 'SFO', 'SYD', 'HKG', 'DOH', 'ICN', 'MAD',
  'BCN', 'FCO', 'YYZ', 'MUC'
];

export function unpackAirport(tuple: RawAirportTuple): Airport {
  return {
    iata: tuple[0],
    icao: tuple[1],
    name: tuple[2],
    city: tuple[3],
    country: tuple[4],
    coordinates: [tuple[5], tuple[6]],
  };
}

export async function loadAirports(): Promise<Airport[]> {
  if (cachedAirports) {
    return cachedAirports;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const rawData = (await import('../../data/airportsData')).default;
      const airports = rawData.map(unpackAirport);

      const iataMap = new Map<string, Airport>();
      const icaoMap = new Map<string, Airport>();

      for (const airport of airports) {
        if (airport.iata) {
          iataMap.set(airport.iata.toUpperCase(), airport);
        }
        if (airport.icao) {
          icaoMap.set(airport.icao.toUpperCase(), airport);
        }
      }

      cachedAirports = airports;
      iataIndex = iataMap;
      icaoIndex = icaoMap;
      return airports;
    })();
  }

  return loadPromise;
}

export function getAirportByCode(code: string): Airport | undefined {
  if (!code || !iataIndex || !icaoIndex) return undefined;
  const normalized = code.trim().toUpperCase();
  return iataIndex.get(normalized) || icaoIndex.get(normalized);
}

export function searchAirportsSync(query: string, limit = 20): Airport[] {
  if (!cachedAirports) return [];

  const trimmed = query.trim();
  if (!trimmed) {
    // Return popular airports when query is empty
    return POPULAR_AIRPORT_CODES
      .map((code) => iataIndex?.get(code))
      .filter((a): a is Airport => Boolean(a))
      .slice(0, limit);
  }

  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();

  const scored: { airport: Airport; score: number }[] = [];

  for (const airport of cachedAirports) {
    let score = 0;
    const aIata = airport.iata;
    const aIcao = airport.icao;
    const aCity = airport.city.toLowerCase();
    const aName = airport.name.toLowerCase();

    if (aIata && aIata === upper) {
      score += 1000;
    } else if (aIcao && aIcao === upper) {
      score += 950;
    } else if (aIata && aIata.startsWith(upper)) {
      score += 900;
    } else if (aIcao && aIcao.startsWith(upper)) {
      score += 850;
    } else if (aCity === lower) {
      score += 800;
    } else if (aCity.startsWith(lower)) {
      score += 700;
    } else if (aName.startsWith(lower)) {
      score += 600;
    } else if (aCity.includes(lower)) {
      score += 500;
    } else if (aName.includes(lower)) {
      score += 400;
    }

    if (score > 0) {
      // Small bonus for airports with IATA code (commercial scheduled service)
      if (airport.iata) score += 10;
      scored.push({ airport, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.airport);
}

export async function searchAirports(query: string, limit = 20): Promise<Airport[]> {
  await loadAirports();
  return searchAirportsSync(query, limit);
}

/**
 * Resets cached database state (primarily useful for unit tests).
 */
export function _resetAirportCacheForTesting(): void {
  cachedAirports = null;
  iataIndex = null;
  icaoIndex = null;
  loadPromise = null;
}
