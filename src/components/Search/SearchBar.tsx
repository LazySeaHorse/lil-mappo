import React, { useState, useEffect } from 'react';
import { Search, MapPin, X, Plus } from 'lucide-react';
import { useProjectStore } from '@/store/useProjectStore';
import { searchPlaces } from '@/services/geocoding';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { nanoid } from 'nanoid';

export const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  
  const { 
    setSearchResults, 
    setHoveredSearchResultId,
    searchResults,
    addItem,
    selectItem,
  } = useProjectStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) {
        searchPlaces(query).then(setSearchResults);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, setSearchResults]);

  const handleClear = () => {
    setQuery('');
    setSearchResults([]);
    setIsOpen(false);
  };

  const handleAddAsCallout = (result: any) => {
    const id = nanoid();
    addItem({
      kind: 'callout',
      id,
      title: result.name.split(',')[0],
      subtitle: result.name.split(',').slice(1).join(',').trim(),
      imageUrl: null,
      lngLat: result.lngLat,
      anchor: 'bottom',
      startTime: 0,
      endTime: 5,
      animation: {
        enter: 'slideUp',
        exit: 'fadeOut',
        enterDuration: 0.5,
        exitDuration: 0.5,
      },
      style: {
        bgColor: '#ffffff',
        textColor: '#000000',
        accentColor: '#3b82f6',
        borderRadius: 12,
        shadow: true,
        maxWidth: 240,
        fontFamily: 'Inter',
        variant: 'topo',
        showMetadata: true,
      },
      altitude: 100,
      poleVisible: true,
      poleColor: '#3b82f6',
    });
    selectItem(id);
    handleClear();
  };

  return (
    <div 
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-auto"
      onMouseLeave={() => setHoveredSearchResultId(null)}
    >
      <div className="relative group">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-foreground transition-colors">
          <Search className="w-4 h-4" />
        </div>
        <Input
          className="pl-10 pr-10 h-10 bg-background/80 backdrop-blur-md border-border/50 shadow-lg rounded-full focus-visible:ring-offset-0"
          placeholder="Search for a place..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
        />
        {query && (
          <button 
            onClick={handleClear}
            className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && searchResults.length > 0 && (
        <Card className="mt-2 bg-background/80 backdrop-blur-xl border-border/50 shadow-2xl overflow-hidden rounded-2xl">
          <ScrollArea className="max-h-[60vh]">
            <div className="p-1">
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center gap-3 p-2 hover:bg-accent/50 rounded-xl cursor-default group/item transition-colors"
                  onMouseEnter={() => setHoveredSearchResultId(result.id)}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-accent-foreground" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="text-sm font-medium truncate">{result.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{result.category}</div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity pr-1">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-8 h-8 rounded-full"
                      title="Add as Callout"
                      onClick={() => handleAddAsCallout(result)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
};
