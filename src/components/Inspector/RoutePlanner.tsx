import { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Car, Footprints, Plane, Search, Loader2, Crosshair, MapPin, X, CheckCircle2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import type { RouteItem } from '@/store/types';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';

interface InspectorSearchFieldProps {
  label: string;
  dotColor: string;
  value: [number, number];
  onSelect: (lngLat: [number, number]) => void;
  pointType: 'start' | 'end';
  item: RouteItem;
}

const InspectorSearchField = ({ 
  value, 
  onSelect, 
  dotColor, 
  label,
  pointType,
  item 
}: InspectorSearchFieldProps) => {
  const { editingRoutePoint, setEditingRoutePoint, setEditingItemId } = useProjectStore();
  const isPicking = editingRoutePoint === pointType;

  const { query, setQuery, suggestions, isOpen, loading, performSearch, handleSelect, clear } = useLocationSearch({
    onSelect: (lngLat) => onSelect(lngLat),
    parseCoordinates: true,
  });

  // Sync internal query when value (coordinates) changes from map click
  useEffect(() => {
    if (value[0] !== 0 || value[1] !== 0) {
      setQuery(`${value[0].toFixed(4)}, ${value[1].toFixed(4)}`);
    } else {
      setQuery('');
    }
  }, [value, setQuery]);

  return (
    <div className="relative group w-full">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 shrink-0 w-14">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shadow-xs shrink-0`} />
          <span className="text-xs font-semibold text-foreground/90">{label}</span>
        </div>

        <div className="relative flex-1">
          <Input
            placeholder="Search address or coords..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(query);
              }
            }}
            className="h-8 text-xs font-mono pl-3 pr-8 bg-background/50 border-border/50 rounded-xl focus-visible:ring-1 focus-visible:ring-primary/20"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-full hover:bg-muted/50"
            >
              <X size={11} />
            </button>
          )}
          {loading && (
            <div className="absolute right-7 top-1/2 -translate-y-1/2">
              <Loader2 className="w-3.5 h-3.5 animate-spin opacity-50 text-primary" />
            </div>
          )}
        </div>

        <IconButton 
          variant={isPicking ? 'default' : 'outline'}
          size="xs"
          className={`rounded-lg h-8 w-8 shrink-0 transition-all ${isPicking ? 'bg-primary text-primary-foreground shadow-sm' : 'border-border/50 bg-background/50'}`}
          onClick={() => {
            setEditingRoutePoint(isPicking ? null : pointType);
            setEditingItemId(isPicking ? null : item.id);
          }}
          title={isPicking ? "Click on map to place point" : "Pick point on map"}
        >
          <Crosshair size={13} className={isPicking ? 'animate-pulse text-white' : 'text-muted-foreground'} />
        </IconButton>
      </div>

      {isOpen && suggestions.length > 0 && (
        <Card className="absolute left-0 z-[110] mt-1 w-full max-h-60 shadow-2xl bg-background border border-border shadow-primary/10 overflow-hidden rounded-xl animate-in fade-in zoom-in-95 duration-200">
          <ScrollArea className="max-h-56 w-full overflow-x-hidden">
            <div className="p-1">
              {suggestions.map((s) => (
                <button
                  key={s.mapbox_id}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-secondary rounded-lg border-b border-border/30 last:border-0 whitespace-nowrap group/res transition-colors flex items-center gap-2"
                  onClick={() => handleSelect(s)}
                >
                  <MapPin size={12} className="text-muted-foreground group-hover/res:text-primary transition-colors shrink-0" />
                  <span className="font-medium text-foreground truncate">{s.name}</span>
                  {s.place_formatted && (
                    <span className="text-[11px] text-muted-foreground truncate">{s.place_formatted}</span>
                  )}
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
  const { updateItem, setPreviewRoute } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);

  const calc = item.calculation || {
    mode: 'car',
    startPoint: [0, 0],
    endPoint: [0, 0],
  };

  const handleModeChange = (mode: 'car' | 'flight' | 'manual') => {
    updateItem(item.id, { calculation: { ...calc, mode } } as any);
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
        toast.success('Route applied');
        setPreviewRoute(null);
        setHasCalculated(true);
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

  const hasCoordinates = 
    item.geojson && 
    item.geojson.features && 
    item.geojson.features.length > 0;

  return (
    <div className="flex flex-col gap-3.5">
      <SegmentedControl
        shape="pill"
        options={[
          { value: 'manual', label: 'Manual' },
          { value: 'car', label: 'Drive', icon: <Car size={13} /> },
          { value: 'flight', label: 'Flight', icon: <Plane size={13} /> },
        ]}
        value={calc.mode || 'car'}
        onValueChange={handleModeChange}
        className="h-8"
      />

      {calc.mode !== 'manual' && (
        <div className="flex flex-col gap-2.5">
          {/* Start Point */}
          <InspectorSearchField 
            label="Start"
            pointType="start"
            item={item}
            value={calc.startPoint}
            onSelect={setStart}
            dotColor="bg-emerald-500"
          />

          {/* End Point */}
          <InspectorSearchField 
            label="End"
            pointType="end"
            item={item}
            value={calc.endPoint}
            onSelect={setEnd}
            dotColor="bg-rose-500"
          />

          {/* Status banner if route exists */}
          {hasCoordinates && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
              <CheckCircle2 size={12} className="shrink-0" />
              <span>Route found</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            <Button 
              type="button"
              onClick={() => calculateRoute(true)} 
              disabled={loading} 
              className="w-full h-10 py-2.5 px-4 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : 'Apply Route'}
            </Button>

            <Button 
              type="button"
              variant="outline" 
              onClick={() => calculateRoute(false)}
              disabled={loading}
              className="w-full h-10 py-2.5 px-4 rounded-xl text-xs font-semibold border border-border/60 bg-background/60 hover:bg-secondary/80 text-foreground shadow-2xs hover:shadow-xs transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Eye size={15} className="text-muted-foreground" />
              <span>Preview on map</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

