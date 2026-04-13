import { useState, useEffect, useRef, useCallback } from 'react';
import { SearchBoxCore, SearchSession } from '@mapbox/search-js-core';
import type {
  SearchBoxSuggestion,
  SearchBoxOptions,
  SearchBoxSuggestionResponse,
  SearchBoxRetrieveResponse,
} from '@mapbox/search-js-core';
import { useProjectStore } from '@/store/useProjectStore';
import { MAPBOX_TOKEN } from '@/config/mapbox';

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
 * Handles session initialization, proximity bias, suggestion fetching, and selection.
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
  const { mapCenter } = useProjectStore();

  const sessionRef = useRef<SearchBoxSession | null>(null);
  const mapCenterRef = useRef(mapCenter);

  // Keep proximity ref in sync with store mapCenter
  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);

  // Initialize SearchBox session once
  useEffect(() => {
    const core = new SearchBoxCore({ accessToken: MAPBOX_TOKEN });
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
      const center = mapCenterRef.current;
      const proximity = center && (center[0] !== 0 || center[1] !== 0) ? center : undefined;
      const response = await sessionRef.current!.suggest(trimmed, { proximity });
      setSuggestions(response.suggestions || []);
      setIsOpen((response.suggestions || []).length > 0);
    } catch {
      setSuggestions([]);
      setIsOpen(false);
    } finally {
      setLoading(false);
    }
  }, [parseCoordinates, onSelect]);

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
