import { useEffect, useRef } from 'react';
import { Plane, Loader2, Crosshair, X } from 'lucide-react';
import { Command as CommandPrimitive } from 'cmdk';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover';
import { IconButton } from '@/components/ui/icon-button';
import {
  useAirportSearch,
  parseCoordinates,
  createCoordinateAirport,
} from '@/hooks/useAirportSearch';
import { cn } from '@/lib/utils';
import type { Airport } from '@/services/airports/types';

export interface AirportSearchFieldProps {
  label?: string;
  value?: [number, number];
  name?: string;
  onSelect: (lngLat: [number, number], name: string) => void;
  color?: string;
  showDot?: boolean;
  isPicking?: boolean;
  onStartPick?: () => void;
  className?: string;
  placeholder?: string;
}

export const AirportSearchField = ({
  label = "Search airports",
  value,
  name = "",
  onSelect,
  color = "bg-primary/10 text-primary border-primary/20",
  showDot = true,
  isPicking = false,
  onStartPick = () => {},
  className = "",
  placeholder,
}: AirportSearchFieldProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    isOpen,
    loading,
    selectAirport,
    clear,
    open,
    close,
  } = useAirportSearch({
    initialQuery: name,
    onSelect: (coords, airportName) => {
      onSelect(coords, airportName);
    },
  });

  // Sync internal query when name prop changes
  useEffect(() => {
    if (name !== undefined) {
      setQuery(name);
    }
  }, [name, setQuery]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter') {
      const coords = parseCoordinates(query);
      if (coords) {
        e.preventDefault();
        const coordAirport = createCoordinateAirport(coords);
        selectAirport(coordAirport);
      }
    }
  };

  const hasContentToShow = results.length > 0 || loading || query.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className={`relative group w-full px-1 !overflow-visible ${className}`}
    >
      <Command
        shouldFilter={false}
        className="w-full bg-transparent overflow-visible text-foreground"
      >
        <Popover
          open={isOpen && hasContentToShow}
          onOpenChange={(openState) => {
            if (!openState) close();
          }}
        >
          <PopoverAnchor asChild>
            <div className="flex items-center gap-2">
              {showDot && (
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${color} shadow-sm transition-all group-focus-within:scale-110`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                </div>
              )}
              <div className="relative flex-1">
                <CommandPrimitive.Input
                  placeholder={isPicking ? "Click on map..." : (placeholder || label)}
                  value={isPicking ? "" : query}
                  onValueChange={(val) => {
                    setQuery(val);
                    if (!isOpen) open();
                  }}
                  onFocus={() => {
                    if (!isPicking) open();
                  }}
                  onClick={() => {
                    if (!isPicking) open();
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={isPicking}
                  className={cn(
                    "h-8 w-full text-sm pl-2 pr-7 bg-secondary/20 border border-transparent focus:border-border/50 rounded-lg transition-all focus-visible:ring-1 focus-visible:ring-primary/20 outline-none text-foreground placeholder:text-muted-foreground",
                    isPicking && "placeholder:text-primary animate-pulse"
                  )}
                />
                {query && !isPicking && (
                  <button
                    type="button"
                    onClick={clear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted/50"
                    aria-label="Clear"
                    title="Clear"
                  >
                    <X size={10} />
                  </button>
                )}
                {loading && (
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2",
                      query && !isPicking ? "right-8" : "right-3"
                    )}
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin opacity-40 text-primary" />
                  </div>
                )}
              </div>
              <IconButton
                variant="ghost"
                size="sm"
                className={`h-8 w-8 shrink-0 rounded-lg transition-all ${
                  isPicking ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={onStartPick}
                title="Pick on Map"
                aria-label="Pick on Map"
              >
                <Crosshair size={14} className={isPicking ? 'animate-spin-slow' : ''} />
              </IconButton>
            </div>
          </PopoverAnchor>

          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (containerRef.current?.contains(e.target as Node)) {
                e.preventDefault();
              }
            }}
            className="w-fit min-w-[280px] sm:min-w-[340px] max-w-[480px] p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-background/95 backdrop-blur-2xl border border-border/50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <CommandList className="flex flex-col p-1 max-h-[300px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-4 px-3 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                  <span>Loading airports...</span>
                </div>
              )}
              {!loading && results.length === 0 && (
                <CommandEmpty className="py-4 px-3 text-center text-xs text-muted-foreground">
                  No airports found
                </CommandEmpty>
              )}
              <CommandGroup className="p-0">
                {results.map((airport: Airport) => (
                  <CommandItem
                    key={`${airport.iata || airport.icao || 'coord'}-${airport.name}-${airport.coordinates.join(',')}`}
                    value={`${airport.name} ${airport.city} ${airport.country} ${airport.iata} ${airport.icao}`}
                    onSelect={() => selectAirport(airport)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center gap-2.5 transition-all border-b border-border/10 last:border-0 hover:bg-primary/5 data-[selected=true]:bg-primary/10 group/airport"
                  >
                    <Plane
                      size={14}
                      className="text-muted-foreground group-hover/airport:text-primary group-data-[selected=true]/airport:text-primary transition-colors shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="font-medium tracking-tight text-foreground/90 group-hover/airport:text-foreground truncate text-xs">
                        {airport.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">
                        {airport.city ? `${airport.city}, ${airport.country}` : airport.country}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {airport.iata && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/15 text-primary tracking-wider uppercase">
                          {airport.iata}
                        </span>
                      )}
                      {airport.icao && (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-secondary text-muted-foreground uppercase">
                          {airport.icao}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </PopoverContent>
        </Popover>
      </Command>
    </div>
  );
};
