import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAirports,
  getAirportByCode,
  searchAirports,
  searchAirportsSync,
  _resetAirportCacheForTesting,
  POPULAR_AIRPORT_CODES,
} from './airportService';

describe('airportService', () => {
  beforeEach(() => {
    _resetAirportCacheForTesting();
  });

  it('loads the full airport database with valid coordinates', async () => {
    const airports = await loadAirports();
    expect(airports.length).toBeGreaterThan(7600);

    // Verify sample coordinates validity
    for (const airport of airports.slice(0, 100)) {
      const [lng, lat] = airport.coordinates;
      expect(typeof lng).toBe('number');
      expect(typeof lat).toBe('number');
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });

  it('retrieves airports by IATA code with case-insensitivity', async () => {
    await loadAirports();

    const jfk = getAirportByCode('JFK');
    expect(jfk).toBeDefined();
    expect(jfk?.name).toContain('Kennedy');
    expect(jfk?.iata).toBe('JFK');
    expect(jfk?.icao).toBe('KJFK');

    // Case-insensitivity
    const lhr = getAirportByCode('lhr');
    expect(lhr).toBeDefined();
    expect(lhr?.name).toContain('Heathrow');
    expect(lhr?.city).toBe('London');
  });

  it('retrieves airports by ICAO code', async () => {
    await loadAirports();

    const egll = getAirportByCode('EGLL');
    expect(egll).toBeDefined();
    expect(egll?.iata).toBe('LHR');

    const omdb = getAirportByCode('omdb');
    expect(omdb).toBeDefined();
    expect(omdb?.city).toBe('Dubai');
  });

  it('returns undefined for non-existent codes', async () => {
    await loadAirports();
    expect(getAirportByCode('ZZZZZZ')).toBeUndefined();
    expect(getAirportByCode('')).toBeUndefined();
  });

  it('returns popular airports when query is empty', async () => {
    const results = await searchAirports('');
    expect(results.length).toBeGreaterThanOrEqual(10);
    const iatas = results.map((r) => r.iata);
    expect(iatas).toContain('JFK');
    expect(iatas).toContain('LHR');
  });

  it('prioritizes exact IATA code match over substring matches', async () => {
    const results = await searchAirports('SFO', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].iata).toBe('SFO');
    expect(results[0].city).toBe('San Francisco');
  });

  it('finds airports by city name', async () => {
    const results = await searchAirports('Tokyo', 10);
    expect(results.length).toBeGreaterThan(0);
    const namesOrCities = results.map((r) => `${r.name} ${r.city}`);
    expect(namesOrCities.some((s) => s.includes('Tokyo') || s.includes('Haneda') || s.includes('Narita'))).toBe(true);
  });

  it('finds airports by name keyword', async () => {
    const results = await searchAirports('Heathrow', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].iata).toBe('LHR');
  });

  it('respects the limit argument', async () => {
    const results = await searchAirports('a', 5);
    expect(results.length).toBe(5);
  });

  it('supports synchronous search once cached', async () => {
    expect(searchAirportsSync('JFK')).toEqual([]);
    await loadAirports();
    const results = searchAirportsSync('JFK');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].iata).toBe('JFK');
  });
});
