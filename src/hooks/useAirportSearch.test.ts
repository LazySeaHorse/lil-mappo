import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  useAirportSearch,
  parseCoordinates,
  createCoordinateAirport,
} from './useAirportSearch';
import { loadAirports, _resetAirportCacheForTesting } from '@/services/airports/airportService';

describe('useAirportSearch', () => {
  beforeAll(async () => {
    await loadAirports();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCoordinates', () => {
    it('parses standard [lng, lat] strings', () => {
      expect(parseCoordinates('-74.006, 40.712')).toEqual([-74.006, 40.712]);
      expect(parseCoordinates('[-74.006, 40.712]')).toEqual([-74.006, 40.712]);
      expect(parseCoordinates('-74.006,40.712')).toEqual([-74.006, 40.712]);
      expect(parseCoordinates(' -122.4194 , 37.7749 ')).toEqual([-122.4194, 37.7749]);
    });

    it('handles [lat, lng] when longitude is clearly beyond 90 degrees', () => {
      expect(parseCoordinates('37.7749, -122.4194')).toEqual([-122.4194, 37.7749]);
    });

    it('returns null for invalid strings', () => {
      expect(parseCoordinates('')).toBeNull();
      expect(parseCoordinates('JFK')).toBeNull();
      expect(parseCoordinates('hello, world')).toBeNull();
      expect(parseCoordinates('200, 300')).toBeNull();
    });
  });

  describe('createCoordinateAirport', () => {
    it('creates a valid Airport object from coordinates', () => {
      const airport = createCoordinateAirport([-74.006, 40.712]);
      expect(airport.coordinates).toEqual([-74.006, 40.712]);
      expect(airport.name).toContain('-74.006');
      expect(airport.name).toContain('40.712');
      expect(airport.city).toBe('Custom Coordinates');
    });
  });

  describe('hook state and controls', () => {
    it('initializes with empty query and popular airports', () => {
      const { result } = renderHook(() => useAirportSearch());

      expect(result.current.query).toBe('');
      expect(result.current.isOpen).toBe(false);
      expect(result.current.results.length).toBeGreaterThanOrEqual(10);
      const iatas = result.current.results.map((a) => a.iata);
      expect(iatas).toContain('JFK');
      expect(iatas).toContain('LHR');
    });

    it('updates results on setQuery', () => {
      const { result } = renderHook(() => useAirportSearch());

      act(() => {
        result.current.setQuery('SFO');
      });

      expect(result.current.query).toBe('SFO');
      expect(result.current.results.length).toBeGreaterThan(0);
      expect(result.current.results[0].iata).toBe('SFO');
    });

    it('prepends synthetic airport when coordinate query is typed', () => {
      const { result } = renderHook(() => useAirportSearch());

      act(() => {
        result.current.setQuery('-74.006, 40.712');
      });

      expect(result.current.results.length).toBeGreaterThan(0);
      expect(result.current.results[0].coordinates).toEqual([-74.006, 40.712]);
      expect(result.current.results[0].name).toContain('-74.006');
    });

    it('manages open and close state', () => {
      const { result } = renderHook(() => useAirportSearch());

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.open();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
      });
      expect(result.current.isOpen).toBe(false);
    });

    it('selects airport and triggers onSelect callback', () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() => useAirportSearch({ onSelect }));

      const targetAirport = result.current.results[0];

      act(() => {
        result.current.open();
        result.current.selectAirport(targetAirport);
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.query).toBe(targetAirport.name);
      expect(onSelect).toHaveBeenCalledWith(
        targetAirport.coordinates,
        targetAirport.name,
        targetAirport
      );
    });

    it('clears query and resets selection', () => {
      const onSelect = vi.fn();
      const { result } = renderHook(() => useAirportSearch({ onSelect }));

      act(() => {
        result.current.setQuery('JFK');
        result.current.open();
      });
      expect(result.current.query).toBe('JFK');
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.clear();
      });

      expect(result.current.query).toBe('');
      expect(result.current.isOpen).toBe(false);
      expect(onSelect).toHaveBeenCalledWith([0, 0], '', undefined);
    });
  });
});
