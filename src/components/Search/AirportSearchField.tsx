import { useEffect, useRef, type ReactNode } from 'react';
import { Plane, Loader2 } from 'lucide-react';
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
import { PickOnMapButton } from './PickOnMapButton';
import { pasteListHandler } from './pasteList';
import { SearchFieldActions } from './SearchFieldActions';
import { SEARCH_BARE_INPUT_CLASS, SEARCH_BOX_CLASS, SEARCH_INPUT_CLASS } from './searchFieldStyles';
import { AddPlacePill } from './PlacePills';
import { isPlacedPoint } from '@/engine/routeMode';
import { HUB_SPOKE_TERMS } from '@/lib/terms';
import {
  useAirportSearch,
  parseCoordinates,
  createCoordinateAirport,
} from '@/hooks/useAirportSearch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Airport } from '@/services/airports/types';

export interface AirportSearchFieldProps {
  label?: string;
  value?: [number, number];
  name?: string;
  onSelect: (lngLat: [number, number], name: string) => void;
  isPicking?: boolean;
  onStartPick?: () => void;
  className?: string;
  placeholder?: string;
  /** In a list of places: called with pasted text that holds several places. */
  onPasteList?: (text: string) => void;
  /** Shows a "+" pill in the box once an airport is chosen; it makes this field a list of places. */
  onMakeList?: () => void;
  /** In a list of places: the pills before the text input. A chosen airport becomes a pill, so the text empties. */
  chips?: ReactNode;
}

export const AirportSearchField = ({
  label = "Search airports",
  value,
  name = "",
  onSelect,
  isPicking = false,
  onStartPick = () => {},
  className = "",
  placeholder,
  onPasteList,
  onMakeList,
  chips,
}: AirportSearchFieldProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    isOpen,
    loading,
    error,
    retry,
    selectAirport,
    clear,
    open,
    close,
  } = useAirportSearch({
    initialQuery: name,
    onSelect: (coords, airportName) => {
      onSelect(coords, airportName);
      if (chips && isPlacedPoint(coords)) setQuery('');
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

  const showMakeList = !!onMakeList && !chips && !!value && isPlacedPoint(value);
  const hasContentToShow = results.length > 0 || loading || error || query.trim().length > 0;

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
              <div className="relative flex-1">
                {(() => {
                  const input = (
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
                      onPaste={pasteListHandler(onPasteList)}
                      onKeyDown={handleKeyDown}
                      disabled={isPicking}
                      className={cn(
                        'h-8',
                        SEARCH_INPUT_CLASS,
                        chips && SEARCH_BARE_INPUT_CLASS,
                        showMakeList && 'pr-[4.75rem]',
                        isPicking && 'placeholder:text-primary animate-pulse',
                      )}
                    />
                  );
                  return chips ? (
                    <div className={SEARCH_BOX_CLASS} data-place-box>{chips}{input}</div>
                  ) : input;
                })()}
                {!isPicking && <SearchFieldActions hasText={query !== ''} loading={loading} onClear={clear} />}
                {onMakeList && showMakeList && !isPicking && (
                  <AddPlacePill label={HUB_SPOKE_TERMS.addPlaces} onClick={onMakeList} className="absolute right-8 top-1/2 -translate-y-1/2" />
                )}
              </div>
              <PickOnMapButton isPicking={isPicking} onClick={onStartPick} />
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
            className="z-tour-popover w-fit min-w-[280px] sm:min-w-[340px] max-w-[480px] p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-background/95 backdrop-blur-2xl border border-border/50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <CommandList className="ph-no-capture flex flex-col p-1 max-h-[300px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-4 px-3 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                  <span>Loading airports...</span>
                </div>
              )}
              {error && (
                <div className="flex items-center justify-center gap-2 py-4 px-3 text-xs text-muted-foreground">
                  <span>Couldn't load airports.</span>
                  <Button type="button" variant="link" size="inline" onClick={retry}>
                    Retry
                  </Button>
                </div>
              )}
              {!loading && !error && results.length === 0 && (
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
                      <span className="text-2xs text-muted-foreground truncate">
                        {airport.city ? `${airport.city}, ${airport.country}` : airport.country}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {airport.iata && (
                        <span className="px-1.5 py-0.5 text-2xs font-bold rounded bg-primary/15 text-primary tracking-wider uppercase">
                          {airport.iata}
                        </span>
                      )}
                      {airport.icao && (
                        <span className="px-1.5 py-0.5 text-2xs font-mono rounded bg-secondary text-muted-foreground uppercase">
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
