import { useEffect, useState, type ReactNode } from 'react';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { Input } from '@/components/ui/input';
import { MapPin } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { SearchFieldActions } from './SearchFieldActions';
import { PickOnMapButton } from './PickOnMapButton';
import { pasteListHandler } from './pasteList';
import { SEARCH_BARE_INPUT_CLASS, SEARCH_BOX_CLASS, SEARCH_INPUT_CLASS } from './searchFieldStyles';
import { AddPlacePill } from './PlacePills';
import { isPlacedPoint } from '@/engine/routeMode';
import { cn } from '@/lib/utils';
import { HUB_SPOKE_TERMS, SEARCH_TERMS } from '@/lib/terms';

interface SearchFieldProps {
  label: string;
  value: [number, number];
  name: string;
  onSelect: (lngLat: [number, number], name: string) => void;
  isPicking: boolean;
  onStartPick: () => void;
  className?: string;
  placeholder?: string;
  /** Also accept typed coordinates such as "-74.006, 40.712" (they select a point with no place name). */
  parseCoordinates?: boolean;
  /** In a list of places: called with pasted text that holds several places. */
  onPasteList?: (text: string) => void;
  /** Shows a "+" pill in the box once a place is chosen; it makes this field a list of places. */
  onMakeList?: () => void;
  /** In a list of places: the pills before the text input. A chosen place becomes a pill, so the text empties. */
  chips?: ReactNode;
}

export const SearchField = ({
  label,
  value,
  name,
  onSelect: onSelectProp,
  isPicking,
  onStartPick,
  className = "",
  placeholder,
  parseCoordinates = false,
  onPasteList,
  onMakeList,
  chips,
}: SearchFieldProps) => {
  // Wrap the prop callback to ensure name is always provided
  const onSelectWithName = (lngLat: [number, number], name?: string) => {
    onSelectProp(lngLat, name || '');
    if (chips && isPlacedPoint(lngLat)) setQuery('');
  };

  const { query, setQuery, suggestions, isOpen, loading, performSearch, handleSelect, handleClose, clear } = useLocationSearch({
    onSelect: onSelectWithName,
    parseCoordinates,
  });

  // The text the user last searched with Enter. The hint under the field is for text not searched yet.
  const [searched, setSearched] = useState('');
  const showMakeList = !!onMakeList && !chips && !!value && isPlacedPoint(value);
  const showEnterHint = !isPicking && !loading && query.trim() !== '' && query !== name && query !== searched;

  // Sync internal query when name prop changes
  useEffect(() => {
    setQuery(name);
  }, [name, setQuery]);

  const renderResults = () => (
    <div className="ph-no-capture flex flex-col p-1 max-h-[300px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {suggestions.map((s) => (
        <button
          key={s.mapbox_id}
          className="w-full text-left px-3 py-2.5 text-xs hover:bg-primary/5 rounded-lg border-b border-border/10 last:border-0 whitespace-nowrap group/res flex items-center gap-2.5 transition-all"
          onClick={() => handleSelect(s)}
        >
          <MapPin size={12} className="text-muted-foreground group-hover/res:text-primary transition-colors shrink-0" />
          <span className="font-medium tracking-tight text-foreground/90 group-hover/res:text-foreground">
            {s.name}
            {s.place_formatted && (
              <span className="font-normal text-muted-foreground ml-1">{s.place_formatted}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );

  const input = (
    <Input
      placeholder={isPicking ? "Click on map..." : (placeholder || label)}
      value={isPicking ? "" : query}
      onChange={(e) => {
        setQuery(e.target.value);
        // Suggestions will be cleared naturally on the next performSearch
      }}
      onPaste={pasteListHandler(onPasteList)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          setSearched(query);
          performSearch(query);
        }
      }}
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

  return (
    <div className={`relative group w-full px-1 !overflow-visible ${className}`}>
      <Popover open={isOpen && suggestions.length > 0} onOpenChange={(o) => !o && handleClose()}>
        <PopoverAnchor asChild>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              {chips ? <div className={SEARCH_BOX_CLASS} data-place-box>{chips}{input}</div> : input}
              {!isPicking && (
                <SearchFieldActions hasText={query !== ''} loading={loading} onClear={clear} />
              )}
              {showMakeList && !isPicking && (
                <AddPlacePill label={HUB_SPOKE_TERMS.addPlaces} onClick={onMakeList} className="absolute right-8 top-1/2 -translate-y-1/2" />
              )}
            </div>
            <PickOnMapButton isPicking={isPicking} onClick={onStartPick} />
          </div>
        </PopoverAnchor>

        {/* Above the quick tour card (z-tour), so results stay clickable beside it. */}
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="z-tour-popover w-fit min-w-[240px] max-w-[480px] p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-background/95 backdrop-blur-2xl border border-border/50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          {renderResults()}
        </PopoverContent>
      </Popover>
      {showEnterHint && <p className="mt-1 px-1 text-2xs text-muted-foreground">{SEARCH_TERMS.enterHint}</p>}
    </div>
  );
};
