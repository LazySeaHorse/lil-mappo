import React, { useState, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchBoundary, NominatimResult } from '@/services/nominatim';
import { toast } from 'sonner';
import { IconButton } from '@/components/ui/icon-button';

interface BoundarySearchProps {
  initialValue: string;
  onSelect: (result: NominatimResult) => void;
  onSearchingChange?: (searching: boolean) => void;
}

export function BoundarySearch({ initialValue, onSelect, onSearchingChange }: BoundarySearchProps) {
  const [query, setQuery] = useState(initialValue);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    onSearchingChange?.(true);
    try {
      const res = await searchBoundary(query);
      if (res.length === 0) {
        toast.error('No boundary polygon found for this place.');
      } else {
        setResults(res);
      }
    } catch (e) {
      toast.error('Boundary lookup failed.');
    } finally {
      setLoading(false);
      onSearchingChange?.(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 relative">
        <Input 
          type="text" 
          value={query} 
          onChange={(e) => setQuery(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()} 
          className="h-9 text-sm bg-secondary/30 border-transparent focus:border-border pr-10" 
          placeholder="e.g. Central Park, Germany..." 
        />
        <IconButton 
          onClick={handleSearch} 
          disabled={loading} 
          variant="ghost" 
          size="sm" 
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-primary"
          loading={loading}
        >
          <Search size={14} />
        </IconButton>
      </div>

      {results.length > 0 && (
        <div className="border border-border/50 rounded-xl bg-background/50 backdrop-blur shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="p-2 border-b border-border/50 bg-secondary/20 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Search Results</span>
            <Button variant="ghost" size="sm" onClick={() => setResults([])} className="h-5 text-[10px] font-medium text-muted-foreground hover:text-foreground">Clear</Button>
          </div>
          <div className="max-h-[160px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {results.map((r, i) => (
              <button 
                key={i} 
                onClick={() => {
                  onSelect(r);
                  setResults([]);
                }} 
                className="w-full text-left px-3 py-2 text-xs hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0 group"
              >
                <div className="font-medium group-hover:text-primary transition-colors">{r.display_name.split(',')[0]}</div>
                <div className="text-[10px] text-muted-foreground truncate">{r.display_name.split(',').slice(1).join(',')}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
