import { useEffect } from 'react';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { Input } from '@/components/ui/input';
import { Loader2, Crosshair, MapPin, X } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { IconButton } from '@/components/ui/icon-button';

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
  name,
  onSelect: onSelectProp,
  color = "bg-primary/10 text-primary border-primary/20",
  isPicking,
  onStartPick,
  className = "",
  placeholder
}: SearchFieldProps) => {
  // Wrap the prop callback to ensure name is always provided
  const onSelectWithName = (lngLat: [number, number], name?: string) => {
    onSelectProp(lngLat, name || '');
  };

  const { query, setQuery, suggestions, isOpen, loading, performSearch, handleSelect, handleClose, clear } = useLocationSearch({
    onSelect: onSelectWithName,
  });

  // Sync internal query when name prop changes
  useEffect(() => {
    setQuery(name);
  }, [name, setQuery]);

  const renderResults = () => (
    <div className="flex flex-col p-1 max-h-[300px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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

  return (
    <div className={`relative group w-full px-1 !overflow-visible ${className}`}>
      <Popover open={isOpen && suggestions.length > 0} onOpenChange={(o) => !o && handleClose()}>
        <PopoverAnchor asChild>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${color} shadow-sm transition-all group-focus-within:scale-110`}>
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
            </div>
            <div className="relative flex-1">
              <Input
                placeholder={isPicking ? "Click on map..." : (placeholder || label)}
                value={isPicking ? "" : query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  // Suggestions will be cleared naturally on the next performSearch
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    performSearch(query);
                  }
                }}
                disabled={isPicking}
                className={`h-8 text-sm pl-2 pr-7 bg-secondary/20 border-transparent focus:border-border/50 rounded-md transition-all focus-visible:ring-1 focus-visible:ring-primary/20 ${isPicking ? 'placeholder:text-primary animate-pulse' : ''}`}
              />
              {query && !isPicking && (
                <button
                  onClick={clear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted/50"
                >
                  <X size={10} />
                </button>
              )}
              {loading && <div className="absolute right-8 top-1/2 -translate-y-1/2"><Loader2 className="w-3.5 h-3.5 animate-spin opacity-40 text-primary" /></div>}
            </div>
            <IconButton
              variant="ghost"
              size="sm"
              className={`h-8 w-8 shrink-0 rounded-md transition-all ${isPicking ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground'}`}
              onClick={onStartPick}
              title="Pick on Map"
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
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="w-fit min-w-[240px] max-w-[480px] p-0 shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-background/95 backdrop-blur-2xl border border-border/50 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          {renderResults()}
        </PopoverContent>
      </Popover>
    </div>
  );
};
