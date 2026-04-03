import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { searchPlaces } from '@/services/geocoding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Car, Footprints, Plane, Search, Loader2, Crosshair, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RouteItem, SearchResult } from '@/store/types';

interface InspectorSearchFieldProps {
  label: string;
  value: [number, number];
  onSelect: (lngLat: [number, number]) => void;
  color: string;
}

const InspectorSearchField = ({ value, onSelect, color, label }: InspectorSearchFieldProps) => {
  const [query, setQuery] = useState(value[0] !== 0 ? `${value[0].toFixed(4)}, ${value[1].toFixed(4)}` : '');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setSearchResults, setHoveredSearchResultId, mapCenter } = useProjectStore();

  // Sync internal query when value (coordinates) changes from map click
  useEffect(() => {
    if (value[0] !== 0) {
      setQuery(`${value[0].toFixed(4)}, ${value[1].toFixed(4)}`);
    } else {
      setQuery('');
    }
  }, [value]);

  const mapCenterRef = React.useRef(mapCenter);
  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);

  useEffect(() => {
    const trimmed = query.trim();
    
    // Check if it's coordinates: "-74.006, 40.712"
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lng = parseFloat(coordMatch[1]);
      const lat = parseFloat(coordMatch[2]);
      if (!isNaN(lng) && !isNaN(lat) && lng !== value[0] && lat !== value[1]) {
        onSelect([lng, lat]);
        setResults([]);
        setSearchResults([]);
        setIsOpen(false);
      }
      return;
    }

    if (trimmed.length < 2) {
      setResults([]);
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchPlaces(trimmed, mapCenterRef.current);
      setResults(res);
      setSearchResults(res); // Update global store for map preview
      setLoading(false);
      setIsOpen(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleClose = () => {
    setIsOpen(false);
    setResults([]);
    setSearchResults([]);
    setHoveredSearchResultId(null);
  };

  const clear = () => {
    setQuery('');
    handleClose();
    onSelect([0,0]);
  };

  return (
    <div className="relative group w-full">
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center shrink-0 border shadow-sm`}>
          <div className="w-1.5 h-1.5 rounded-full bg-current" />
        </div>
        <div className="relative flex-1">
          <Input 
            placeholder={label}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-[11px] font-mono pl-3 pr-8 bg-background/50 border-border/50 rounded-full focus-visible:ring-1 focus-visible:ring-primary/20"
          />
          {query && (
            <button 
              onClick={clear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full hover:bg-muted/50"
            >
              <X size={10} />
            </button>
          )}
          {loading && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin opacity-40 text-primary" />}
        </div>
      </div>
      
      {isOpen && results.length > 0 && (
        <Card className="absolute left-0 z-[110] mt-1 w-fit min-w-[200px] max-w-[400px] shadow-2xl bg-background border border-border shadow-primary/10 overflow-hidden rounded-lg animate-in fade-in zoom-in-95 duration-200">
          <ScrollArea className="max-h-60 w-full overflow-x-hidden">
            <div className="p-1">
              {results.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left px-3 py-2 text-[10px] hover:bg-secondary rounded border-b border-border last:border-0 whitespace-nowrap group/res"
                  onMouseEnter={() => setHoveredSearchResultId(r.id)}
                  onMouseLeave={() => setHoveredSearchResultId(null)}
                  onClick={() => {
                    onSelect(r.lngLat);
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

interface RoutePlannerProps {
  item: RouteItem;
}

export const RoutePlanner = ({ item }: RoutePlannerProps) => {
  const { updateItem, editingRoutePoint, setEditingRoutePoint, setEditingItemId, setPreviewRoute } = useProjectStore();
  const [loading, setLoading] = useState(false);

  const calc = item.calculation || {
    mode: 'manual',
    startPoint: [0, 0],
    endPoint: [0, 0],
  };

  const handleModeChange = (mode: 'car' | 'walk' | 'flight' | 'manual') => {
    let vehicle = calc.vehicle;
    if (vehicle?.enabled) {
      vehicle = { ...vehicle, type: mode === 'flight' ? 'plane' : 'car' };
    }
    updateItem(item.id, { calculation: { ...calc, mode, vehicle } } as any);
  };

  const calculateRoute = async (saveToItem: boolean) => {
    if (calc.mode === 'manual') return;
    if (!calc.startPoint || !calc.endPoint || (calc.startPoint[0] === 0 && calc.startPoint[1] === 0)) {
       toast.error('Set start and end points');
       return;
    }

    setLoading(true);
    try {
      let geojson: GeoJSON.Geometry;
      if (calc.mode === 'car' || calc.mode === 'walk') {
        const result = await getDirections(calc.startPoint, calc.endPoint, calc.mode);
        geojson = result.geometry;
      } else {
        geojson = calculateFlightArc(calc.startPoint, calc.endPoint);
      }

      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geojson, properties: {} }]
      };

      if (saveToItem) {
        updateItem(item.id, { geojson: featureCollection } as any);
        toast.success('Route saved');
        setPreviewRoute(null);
      } else {
        setPreviewRoute(featureCollection);
        toast.success('Preview ready');
      }
    } catch (err: any) {
      toast.error('Calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const setStart = (lngLat: [number, number]) => {
    updateItem(item.id, { calculation: { ...calc, startPoint: lngLat } } as any);
    setPreviewRoute(null);
  };

  const setEnd = (lngLat: [number, number]) => {
    updateItem(item.id, { calculation: { ...calc, endPoint: lngLat } } as any);
    setPreviewRoute(null);
  };

  return (
    <div className="space-y-6 pt-2">
      {/* Segmented Mode Selector */}
      <div className="flex bg-secondary/50 p-1 rounded-full relative h-10">
        {(['manual', 'car', 'walk', 'flight'] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-full text-[10px] font-bold transition-all z-10 ${
              calc.mode === m ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {m === 'manual' && <MapPin size={13} />}
            {m === 'car' && <Car size={13} />}
            {m === 'walk' && <Footprints size={13} />}
            {m === 'flight' && <Plane size={13} />}
            <span className="capitalize">{m}</span>
          </button>
        ))}
        <div 
          className="absolute top-1 bottom-1 bg-background rounded-full shadow-sm transition-all duration-200 ease-out z-0"
          style={{
            width: 'calc(25% - 4px)',
            left: calc.mode === 'manual' ? '2px' : calc.mode === 'car' ? 'calc(25% + 1px)' : calc.mode === 'walk' ? 'calc(50% + 1px)' : 'calc(75% + 1px)',
          }}
        />
      </div>

      {calc.mode !== 'manual' && (
        <div className="space-y-4">
          <div className="space-y-3 relative">
            {/* Start Point */}
            <div className="flex items-center gap-2">
              <InspectorSearchField 
                label="Search or Coordinates..."
                value={calc.startPoint}
                onSelect={setStart}
                color="bg-green-500/10 text-green-500 border-green-500/20"
              />
              <Button 
                variant={editingRoutePoint === 'start' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const active = editingRoutePoint === 'start';
                  setEditingRoutePoint(active ? null : 'start');
                  setEditingItemId(active ? null : item.id);
                }}
              >
                <Crosshair size={14} className={editingRoutePoint === 'start' ? 'animate-pulse text-white' : ''} />
              </Button>
            </div>

            {/* End Point */}
            <div className="flex items-center gap-2">
              <InspectorSearchField 
                label="Search or Coordinates..."
                value={calc.endPoint}
                onSelect={setEnd}
                color="bg-red-500/10 text-red-500 border-red-500/20"
              />
              <Button 
                variant={editingRoutePoint === 'end' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const active = editingRoutePoint === 'end';
                  setEditingRoutePoint(active ? null : 'end');
                  setEditingItemId(active ? null : item.id);
                }}
              >
                <Crosshair size={14} className={editingRoutePoint === 'end' ? 'animate-pulse text-white' : ''} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => calculateRoute(false)}
              disabled={loading}
              className="h-8 rounded-full text-xs font-medium border-border/50 hover:bg-secondary/50 group"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} className="text-muted-foreground group-hover:text-foreground transition-colors" />}
              Preview Path
            </Button>
            
            <Button 
              onClick={() => calculateRoute(true)} 
              disabled={loading} 
              className="h-8 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
            >
              Update Route
            </Button>
          </div>

          <div className="pt-4 border-t border-border/10 flex flex-col gap-4 opacity-50 cursor-not-allowed grayscale pointer-events-none">
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">3D Vehicle</span>
                <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">PRO</span>
              </div>
              <Switch disabled checked={false} />
            </div>

            <div className="space-y-2 opacity-50">
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>Model Scale</span>
                <span>1.0x</span>
              </div>
              <Slider disabled value={[1]} min={0.1} max={5} step={0.1} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
