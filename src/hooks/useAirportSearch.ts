import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadAirports,
  searchAirportsSync,
} from '@/services/airports/airportService';
import type { Airport } from '@/services/airports/types';

export interface UseAirportSearchOptions {
  onSelect?: (coordinates: [number, number], name: string, airport?: Airport) => void;
  initialQuery?: string;
  limit?: number;
}

export interface UseAirportSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: Airport[];
  isOpen: boolean;
  loading: boolean;
  selectAirport: (airport: Airport) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
}

/**
 * Parses a direct coordinate string such as "-74.006, 40.712", "[ -74.006 , 40.712 ]", etc.
 * Supports power users pasting coordinates directly into the airport search input.
 * Returns [lng, lat] or null if not a valid coordinate pair.
 */
export function parseCoordinates(input: string): [number, number] | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Matches "-74.006, 40.712" or "[-74.006, 40.712]" or "-74.006 40.712"
  const match = trimmed.match(/^\[?\s*(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)\s*\]?$/);
  if (!match) return null;

  const num1 = parseFloat(match[1]);
  const num2 = parseFloat(match[2]);

  if (Number.isNaN(num1) || Number.isNaN(num2)) return null;

  // Check if num1 is longitude (abs > 90 and <= 180) and num2 is latitude (abs <= 90)
  if (Math.abs(num1) > 90 && Math.abs(num1) <= 180 && Math.abs(num2) <= 90) {
    return [num1, num2];
  }

  // Check if num2 is longitude (abs > 90 and <= 180) and num1 is latitude (abs <= 90) -> [lng, lat]
  if (Math.abs(num2) > 90 && Math.abs(num2) <= 180 && Math.abs(num1) <= 90) {
    return [num2, num1];
  }

  // If both numbers are in [-90, 90], default to standard GeoJSON/Mapbox [lng, lat] order
  if (Math.abs(num1) <= 180 && Math.abs(num2) <= 90) {
    return [num1, num2];
  }

  return null;
}

/**
 * Creates a synthetic Airport object for custom coordinates.
 */
export function createCoordinateAirport(lngLat: [number, number]): Airport {
  const [lng, lat] = lngLat;
  return {
    iata: '',
    icao: '',
    name: `Coordinates: ${lng.toFixed(4)}, ${lat.toFixed(4)}`,
    city: 'Custom Coordinates',
    country: `${lng}, ${lat}`,
    coordinates: [lng, lat],
  };
}

/**
 * Hook managing airport search state, lazy database loading, coordinate parsing,
 * and result suggestions.
 */
export function useAirportSearch(options: UseAirportSearchOptions = {}): UseAirportSearchReturn {
  const { onSelect, initialQuery = '', limit = 25 } = options;

  const [query, setQueryState] = useState(initialQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [results, setResults] = useState<Airport[]>(() => {
    const coords = parseCoordinates(initialQuery);
    const sync = searchAirportsSync(initialQuery, limit);
    if (coords) {
      return [createCoordinateAirport(coords), ...sync];
    }
    return sync;
  });

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const updateResults = useCallback(
    (searchQuery: string) => {
      const coords = parseCoordinates(searchQuery);
      const matches = searchAirportsSync(searchQuery, limit);
      if (coords) {
        setResults([createCoordinateAirport(coords), ...matches]);
      } else {
        setResults(matches);
      }
    },
    [limit]
  );

  const setQuery = useCallback(
    (newQuery: string) => {
      setQueryState(newQuery);
      updateResults(newQuery);
    },
    [updateResults]
  );

  // Lazy-load database on mount or if not yet loaded
  useEffect(() => {
    let isCurrent = true;
    const isLoaded = searchAirportsSync('').length > 0;
    if (isLoaded) {
      return;
    }

    setLoading(true);
    loadAirports()
      .then(() => {
        if (!isCurrent) return;
        setLoading(false);
        updateResults(query);
      })
      .catch((err) => {
        console.error('Failed to load airports database:', err);
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [updateResults, query]);

  const selectAirport = useCallback((airport: Airport) => {
    setQueryState(airport.name);
    setIsOpen(false);
    onSelectRef.current?.(airport.coordinates, airport.name, airport);
  }, []);

  const clear = useCallback(() => {
    setQueryState('');
    setIsOpen(false);
    updateResults('');
    onSelectRef.current?.([0, 0], '', undefined);
  }, [updateResults]);

  const open = useCallback(() => {
    setIsOpen(true);
    const isLoaded = searchAirportsSync('').length > 0;
    if (!isLoaded) {
      setLoading(true);
      void loadAirports().then(() => {
        setLoading(false);
        updateResults(query);
      });
    } else {
      updateResults(query);
    }
  }, [query, updateResults]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    isOpen,
    loading,
    selectAirport,
    clear,
    open,
    close,
  };
}
