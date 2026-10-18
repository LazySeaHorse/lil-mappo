import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchBoundary, shortPlaceName, NominatimResult } from '@/services/nominatim';
import { toast } from 'sonner';
import { SearchFieldActions } from '@/components/Search/SearchFieldActions';
import { SEARCH_INPUT_CLASS } from '@/components/Search/searchFieldStyles';
import { cn } from '@/lib/utils';
import { useMapRef } from '@/hooks/useMapRef';
import { readMapView } from '@/services/locationSearch';

interface BoundarySearchProps {
  initialValue: string;
  onSelect: (result: NominatimResult) => void;
  /** Put the cursor in the field on mount, for a search the user just asked for. */
  autoFocus?: boolean;
}

/** The search's progress is local to this component: the boundary item only changes when a result is picked. */
export function BoundarySearch({ initialValue, onSelect, autoFocus = false }: BoundarySearchProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const mapRef = useMapRef();

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      abortControllerRef.current?.abort();
    };
  }, []);

  const executeSearch = async (searchTerm: string) => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);

    try {
      const view = readMapView(mapRef.current?.getMap());
      const res = await searchBoundary(trimmed, abortController.signal, view?.bbox);
      if (abortController.signal.aborted) {
        return;
      }
      if (res.length === 0) {
        toast.error('Cannot find a boundary for this place.');
      } else {
        setResults(res);
      }
    } catch (e: unknown) {
      if (abortController.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
        return;
      }
      toast.error('Cannot search boundaries.');
    } finally {
      // An aborted search was superseded, cleared or unmounted; whoever aborted it owns loading.
      if (!abortController.signal.aborted) setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    setQuery(val);
    if (results.length > 0) setResults([]);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!val.trim()) {
      abortControllerRef.current?.abort();
      setLoading(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val);
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      executeSearch(query);
    }
  };

  const handleClear = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    abortControllerRef.current?.abort();
    setQuery('');
    setResults([]);
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 relative">
        <Input 
          type="text" 
          autoFocus={autoFocus}
          value={query} 
          onChange={(e) => handleChange(e.target.value)} 
          onKeyDown={handleKeyDown} 
          className={cn('h-9', SEARCH_INPUT_CLASS)}
          placeholder="Search for a place or region"
        />
        <SearchFieldActions hasText={query !== ''} loading={loading} onClear={handleClear} />
      </div>

      {results.length > 0 && (
        <div className="border border-border/50 rounded-xl bg-background/50 backdrop-blur shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="p-2 border-b border-border/50 bg-secondary/20 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground/80">Search results</span>
            <Button variant="subtle" size="xs" onClick={() => setResults([])}>Clear</Button>
          </div>
          <div className="ph-no-capture max-h-[160px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {results.map((r, i) => (
              <button 
                key={i} 
                onClick={() => {
                  onSelect(r);
                  setResults([]);
                }} 
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0 group"
              >
                <div className="font-medium group-hover:text-primary transition-colors">{shortPlaceName(r.display_name)}</div>
                <div className="text-2xs text-muted-foreground truncate">{r.display_name.split(',').slice(1).join(',')}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
