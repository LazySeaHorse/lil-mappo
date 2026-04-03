import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { searchPlaces } from '@/services/geocoding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Car, Footprints, Plane, Search, Loader2, Crosshair, 
  Route as RouteIcon, Upload, Plus,
  MapPin, X
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { RouteItem, SearchResult } from '@/store/types';

interface SearchFieldProps {
  label: string;
  value: [number, number];
  name: string;
  onSelect: (lngLat: [number, number], name: string) => void;
  color: string;
  isPicking: boolean;
  onStartPick: () => void;
}

const SearchField = ({ label, value, name, onSelect, color, isPicking, onStartPick }: SearchFieldProps) => {
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setSearchResults, setHoveredSearchResultId, mapCenter } = useProjectStore();

  const mapCenterRef = React.useRef(mapCenter);
  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);

  useEffect(() => {
    setQuery(name);
  }, [name]);

  useEffect(() => {
    const trimmed = query.trim();
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
  }, [query, name]);

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
    <div className="relative group w-full px-1 !overflow-visible">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${color} shadow-sm`}>
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>
        <div className="relative flex-1">
          <Input 
            placeholder={isPicking ? "Click on map..." : label}
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

export const RouteAddDropdown = ({ onImportClick }: { onImportClick: () => void }) => {
  const { 
    addItem, selectItem, playheadTime, previewRoute, setPreviewRoute,
    editingRoutePoint, setEditingRoutePoint,
    draftStart, setDraftStart, draftEnd, setDraftEnd
  } = useProjectStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'car' | 'walk' | 'flight'>('car');
  const [start, setStart] = useState<[number, number]>([0, 0]);
  const [startName, setStartName] = useState('');
  const [end, setEnd] = useState<[number, number]>([0, 0]);
  const [endName, setEndName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync internal state from store drafts (map picks)
  useEffect(() => {
    if (draftStart) {
      setStart(draftStart.lngLat);
      setStartName(draftStart.name);
      setDraftStart(null); // consume it
    }
  }, [draftStart, setDraftStart]);

  useEffect(() => {
    if (draftEnd) {
      setEnd(draftEnd.lngLat);
      setEndName(draftEnd.name);
      setDraftEnd(null); // consume it
    }
  }, [draftEnd, setDraftEnd]);

  const calculate = async () => {
    if (start[0] === 0 || end[0] === 0) {
      toast.error('Set start and end');
      return;
    }
    setLoading(true);
    try {
      let geojson: GeoJSON.Geometry;
      if (mode === 'car' || mode === 'walk') {
        const res = await getDirections(start, end, mode);
        geojson = res.geometry;
      } else {
        geojson = calculateFlightArc(start, end);
      }
      setPreviewRoute({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geojson, properties: {} }]
      });
      toast.success('Ready to insert');
    } catch (e) {
      toast.error('Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!previewRoute) return;

    const id = nanoid();
    const item: RouteItem = {
      kind: 'route',
      id,
      name: `${startName || 'Start'} to ${endName || 'End'}`,
      geojson: previewRoute,
      startTime: playheadTime,
      endTime: playheadTime + 5,
      style: {
        color: mode === 'flight' ? '#f59e0b' : '#3b82f6',
        width: 4,
        glow: true,
        glowColor: mode === 'flight' ? '#fbbf24' : '#3b82f6',
        glowWidth: 12,
        trailFade: false,
        trailFadeLength: 0.3,
        dashPattern: null,
      },
      calculation: {
        mode,
        startPoint: start,
        endPoint: end,
        vehicle: {
          enabled: true,
          type: mode === 'flight' ? 'plane' : 'car',
          modelId: '',
          scale: 1,
        }
      },
      easing: 'easeInOutQuad',
    };

    addItem(item);
    selectItem(id);
    setStart([0, 0]);
    setStartName('');
    setEnd([0, 0]);
    setEndName('');
    setPreviewRoute(null);
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`h-8 w-8 px-0 transition-colors ${isOpen ? 'text-primary bg-primary/5' : 'text-foreground hover:text-primary'}`}
        >
          <RouteIcon size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align={isMobile ? "center" : "start"}
        collisionPadding={16}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[calc(100vw-32px)] md:w-[300px] bg-background/95 border border-border rounded-2xl shadow-xl !overflow-visible flex flex-col max-h-[80vh] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="p-4 flex flex-col gap-4 w-full !overflow-visible">
          <div className="flex bg-secondary/50 p-1 rounded-lg text-xs font-medium">
            {(['car', 'walk', 'flight'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md transition-all ${mode === m ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <span className="capitalize">{m}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4 relative !overflow-visible">
            <SearchField 
              label="Start Location"
              value={start}
              name={startName}
              onSelect={(lngLat, name) => { setStart(lngLat); setStartName(name); }}
              color="bg-green-500/10 text-green-500 border-green-500/20"
              isPicking={editingRoutePoint === 'start'}
              onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'start' ? null : 'start')}
            />
            
            <SearchField 
              label="End Location"
              value={end}
              name={endName}
              onSelect={(lngLat, name) => { setEnd(lngLat); setEndName(name); }}
              color="bg-red-500/10 text-red-500 border-red-500/20"
              isPicking={editingRoutePoint === 'end'}
              onStartPick={() => setEditingRoutePoint(editingRoutePoint === 'end' ? null : 'end')}
            />
          </div>

          <div className="flex flex-col gap-2 w-full mt-2">
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={calculate}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs bg-secondary/50 hover:bg-secondary border border-border/50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview Path
            </Button>

            <Button 
              variant="default"
              size="sm" 
              onClick={handleAdd}
              disabled={!previewRoute}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs font-medium"
            >
              <Plus size={13} /> Insert Route
            </Button>

            <Button 
              variant="ghost"
              size="sm"
              onClick={onImportClick}
              className="w-full h-8 flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium"
            >
              <Upload size={13} /> Import KML / GPX
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
