import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { searchPlaces } from '@/services/geocoding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, Crosshair, MapPin, X
} from 'lucide-react';
import { SearchResult } from '@/store/types';

interface SearchFieldProps {
  label: string;
  value: [number, number];
  name: string;
  onSelect: (lngLat: [number, number], name: string) => void;
  color?: string;
  isPicking: boolean;
  onStartPick: () => void;
  className?: string;
  placeholder?: string;
}

export const SearchField = ({ 
  label, 
  value, 
  name, 
  onSelect, 
  color = "bg-primary/10 text-primary border-primary/20", 
  isPicking, 
  onStartPick,
  className = "",
  placeholder
}: SearchFieldProps) => {
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setSearchResults, setHoveredSearchResultId, mapCenter } = useProjectStore();

  const mapCenterRef = React.useRef(mapCenter);
  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);

  // Sync internal query when name prop changes
  useEffect(() => {
    setQuery(name);
  }, [name]);

  useEffect(() => {
    const trimmed = query.trim();
    // If query is too short or matches current name exactly, clear results
    if (trimmed.length < 2 || trimmed === name) {
      setResults([]);
      setSearchResults([]);
      setIsOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchPlaces(trimmed, mapCenterRef.current);
      setResults(res);
      setSearchResults(res);
      setLoading(false);
      setIsOpen(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, name, setSearchResults]);

  const handleClose = () => {
    setIsOpen(false);
    setResults([]);
    setSearchResults([]);
    setHoveredSearchResultId(null);
  };

  const clear = () => {
    setQuery('');
    handleClose();
    onSelect([0,0], '');
  };

  return (
    <div className={`relative group w-full px-1 !overflow-visible ${className}`}>
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${color} shadow-sm`}>
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>
        <div className="relative flex-1">
          <Input 
            placeholder={isPicking ? "Click on map..." : (placeholder || label)}
            value={isPicking ? "" : query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isPicking}
            className={`h-8 text-sm pl-2 pr-7 bg-background/50 border-border/50 rounded-md focus-visible:ring-1 focus-visible:ring-primary/20 ${isPicking ? 'placeholder:text-primary animate-pulse' : ''}`}
          />
          {query && !isPicking && (
            <button 
              onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted/50"
            >
              <X size={10} />
            </button>
          )}
          {loading && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin opacity-40 text-primary" />}
        </div>
        <Button 
          variant="ghost"
          size="icon"
          className={`h-8 w-8 shrink-0 rounded-md transition-colors ${isPicking ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={onStartPick}
          title="Pick on Map"
        >
          <Crosshair size={14} className={isPicking ? 'animate-spin-slow' : ''} />
        </Button>
      </div>
      
      {isOpen && results.length > 0 && (
        <Card className="absolute left-0 z-[110] mt-1 w-fit min-w-[200px] max-w-[400px] shadow-2xl bg-background border border-border shadow-primary/10 overflow-hidden rounded-lg animate-in fade-in zoom-in-95 duration-200">
          <ScrollArea className="max-h-60 w-full overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="p-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-secondary rounded border-b border-border last:border-0 whitespace-nowrap group/res"
                  onMouseEnter={() => setHoveredSearchResultId(r.id)}
                  onMouseLeave={() => setHoveredSearchResultId(null)}
                  onClick={() => {
                    onSelect(r.lngLat, r.name.split(',')[0]);
                    handleClose();
                  }}
                >
                  <MapPin size={10} className="text-muted-foreground group-hover/res:text-primary transition-colors inline mr-2 shrink-0" />
                  <span>{r.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
};
