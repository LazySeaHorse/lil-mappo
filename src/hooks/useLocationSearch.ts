import { useState, useEffect, useRef, useCallback } from 'react';
import { SearchBoxCore, SearchSession } from '@mapbox/search-js-core';
import type {
  SearchBoxSuggestion,
  SearchBoxOptions,
  SearchBoxSuggestionResponse,
  SearchBoxRetrieveResponse,
} from '@mapbox/search-js-core';
import { useProjectStore } from '@/store/useProjectStore';
import { getEffectiveMapboxToken } from '@/config/mapbox';
import { isPlacedPoint } from '@/engine/routeMode';
import { useMapRef } from '@/hooks/useMapRef';
import { readMapView, suggestForView } from '@/services/locationSearch';

type SearchBoxSession = SearchSession<
  SearchBoxOptions,
  SearchBoxSuggestion,
  SearchBoxSuggestionResponse,
  SearchBoxRetrieveResponse
>;

interface UseLocationSearchOptions {
  onSelect: (lngLat: [number, number], name?: string) => void;
  parseCoordinates?: boolean;
}

interface UseLocationSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  suggestions: SearchBoxSuggestion[];
  isOpen: boolean;
  loading: boolean;
  performSearch: (term: string) => Promise<void>;
  handleSelect: (suggestion: SearchBoxSuggestion) => Promise<void>;
  handleClose: () => void;
  clear: () => void;
}

/**
 * Hook that manages location search state and Mapbox SearchBox session.
 * Handles session initialization, suggestion fetching, and selection. A search favors the
 * visible map: first inside its bounds, then (only if that finds nothing) anywhere, both
 * near its center. Without a live map it falls back to the stored `mapCenter`.
 *
 * @param onSelect Callback when a location is selected: (lngLat, name?) => void
 * @param parseCoordinates If true, allows direct coordinate input like "-74.006, 40.712"
 */
export function useLocationSearch({
  onSelect,
  parseCoordinates = false,
}: UseLocationSearchOptions): UseLocationSearchReturn {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchBoxSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mapRef = useMapRef();

  const sessionRef = useRef<SearchBoxSession | null>(null);

  // Initialize SearchBox session once
  useEffect(() => {
    const core = new SearchBoxCore({ accessToken: getEffectiveMapboxToken() });
    sessionRef.current = new SearchSession(core, 300);
    return () => { sessionRef.current = null; };
  }, []);

  const performSearch = useCallback(async (searchTerm: string) => {
    const trimmed = searchTerm.trim();

    // Check if it's a coordinate string (e.g., "-74.006, 40.712")
    if (parseCoordinates) {
      const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
      if (coordMatch) {
        const lng = parseFloat(coordMatch[1]);
        const lat = parseFloat(coordMatch[2]);
        if (!isNaN(lng) && !isNaN(lat)) {
          onSelect([lng, lat]);
          setSuggestions([]);
          setIsOpen(false);
          return;
        }
      }
    }

    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const storedCenter = useProjectStore.getState().mapCenter;
      const view = readMapView(mapRef.current?.getMap()) ?? {
        center: isPlacedPoint(storedCenter) ? storedCenter : undefined,
      };
      const response = await suggestForView(sessionRef.current!, trimmed, view);
      setSuggestions(response.suggestions || []);
      setIsOpen((response.suggestions || []).length > 0);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, [parseCoordinates, onSelect, mapRef]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSuggestions([]);
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    handleClose();
    onSelect([0, 0]);
  }, [handleClose, onSelect]);

  const handleSelect = useCallback(async (suggestion: SearchBoxSuggestion) => {
    try {
      const result = await sessionRef.current!.retrieve(suggestion);
      const feature = result.features[0];
      const [lng, lat] = feature.geometry.coordinates;
      onSelect([lng, lat], feature.properties?.name || suggestion.name || '');
    } catch {
      // retrieve failed; no action
    }
    handleClose();
  }, [handleClose, onSelect]);

  return {
    query,
    setQuery,
    suggestions,
    isOpen,
    loading,
    performSearch,
    handleSelect,
    handleClose,
    clear,
  };
}
