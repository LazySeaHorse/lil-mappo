import { useState, useEffect, useRef } from 'react';
import { SearchBoxCore, SearchSession } from '@mapbox/search-js-core';
import type {
  SearchBoxSuggestion,
  SearchBoxOptions,
  SearchBoxSuggestionResponse,
  SearchBoxRetrieveResponse,
} from '@mapbox/search-js-core';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { MAPBOX_TOKEN } from '@/config/mapbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Car, Circle, Footprints, Plane, Search, Loader2, Crosshair, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RouteItem } from '@/store/types';

import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ProBadge } from '@/components/ui/pro-badge';
import { useSubscription } from '@/hooks/useSubscription';

type SearchBoxSession = SearchSession<
  SearchBoxOptions,
  SearchBoxSuggestion,
  SearchBoxSuggestionResponse,
  SearchBoxRetrieveResponse
>;

interface InspectorSearchFieldProps {
  label: string;
  value: [number, number];
  onSelect: (lngLat: [number, number]) => void;
  color: string;
}

const InspectorSearchField = ({ value, onSelect, color, label }: InspectorSearchFieldProps) => {
  const [query, setQuery] = useState(value[0] !== 0 ? `${value[0].toFixed(4)}, ${value[1].toFixed(4)}` : '');
  const [suggestions, setSuggestions] = useState<SearchBoxSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { mapCenter } = useProjectStore();

  const sessionRef = useRef<SearchBoxSession | null>(null);
  const mapCenterRef = useRef(mapCenter);

  useEffect(() => {
    mapCenterRef.current = mapCenter;
  }, [mapCenter]);

  useEffect(() => {
    const core = new SearchBoxCore({ accessToken: MAPBOX_TOKEN });
    sessionRef.current = new SearchSession(core, 300);
    return () => { sessionRef.current = null; };
  }, []);

  // Sync internal query when value (coordinates) changes from map click
  useEffect(() => {
    if (value[0] !== 0) {
      setQuery(`${value[0].toFixed(4)}, ${value[1].toFixed(4)}`);
    } else {
      setQuery('');
    }
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();

    // Check if it's coordinates: "-74.006, 40.712"
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lng = parseFloat(coordMatch[1]);
      const lat = parseFloat(coordMatch[2]);
      if (!isNaN(lng) && !isNaN(lat) && lng !== value[0] && lat !== value[1]) {
        onSelect([lng, lat]);
        setSuggestions([]);
        setIsOpen(false);
      }
      return;
    }

    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const center = mapCenterRef.current;
        const proximity = center && (center[0] !== 0 || center[1] !== 0) ? center : undefined;
        const response = await sessionRef.current!.suggest(trimmed, { proximity });
        if (!cancelled) {
          setSuggestions(response.suggestions || []);
          setIsOpen((response.suggestions || []).length > 0);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [query]);

  const handleClose = () => {
    setIsOpen(false);
    setSuggestions([]);
  };

  const clear = () => {
    setQuery('');
    handleClose();
    onSelect([0, 0]);
  };

  const handleSelect = async (suggestion: SearchBoxSuggestion) => {
    try {
      const result = await sessionRef.current!.retrieve(suggestion);
      const feature = result.features[0];
      const [lng, lat] = feature.geometry.coordinates;
      onSelect([lng, lat]);
    } catch {
      // retrieve failed; no action
    }
    handleClose();
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
          {loading && <div className="absolute right-8 top-1/2 -translate-y-1/2"><Loader2 className="w-3.5 h-3.5 animate-spin opacity-40 text-primary" /></div>}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <Card className="absolute left-0 z-[110] mt-1 w-fit min-w-[200px] max-w-[400px] shadow-2xl bg-background border border-border shadow-primary/10 overflow-hidden rounded-lg animate-in fade-in zoom-in-95 duration-200">
          <ScrollArea className="max-h-60 w-full overflow-x-hidden">
            <div className="p-1">
              {suggestions.map((s) => (
                <button
                  key={s.mapbox_id}
                  className="w-full text-left px-3 py-2 text-[10px] hover:bg-secondary rounded border-b border-border last:border-0 whitespace-nowrap group/res"
                  onClick={() => handleSelect(s)}
                >
                  <MapPin size={10} className="text-muted-foreground group-hover/res:text-primary transition-colors inline mr-2 shrink-0" />
                  <span>{s.name}</span>
                  {s.place_formatted && (
                    <span className="text-muted-foreground ml-1">{s.place_formatted}</span>
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
  const { updateItem, editingRoutePoint, setEditingRoutePoint, setEditingItemId, setPreviewRoute } = useProjectStore();
  const [loading, setLoading] = useState(false);

  const { data: sub } = useSubscription();
  const isPro = sub && (sub.tier === 'wanderer' || sub.tier === 'cartographer' || sub.tier === 'pioneer');

  const calc = item.calculation || {
    mode: 'manual',
    startPoint: [0, 0],
    endPoint: [0, 0],
  };

  const handleModeChange = (mode: 'car' | 'walk' | 'flight' | 'manual') => {
    let vehicle = calc.vehicle;
    // Auto-switch model type for 3D vehicles (not dot) when travel mode changes
    if (vehicle?.enabled && vehicle.type !== 'dot') {
      vehicle = { ...vehicle, type: mode === 'flight' ? 'plane' : 'car' };
    }
    updateItem(item.id, { calculation: { ...calc, mode, vehicle } } as any);
  };

  const updateVehicle = (patch: Partial<NonNullable<RouteItem['calculation']>['vehicle']>) => {
    const currentVehicle = calc.vehicle || {
      enabled: false,
      type: 'dot' as const,
      modelId: '',
      scale: 1.0,
    };
    updateItem(item.id, { 
      calculation: { 
        ...calc, 
        vehicle: { ...currentVehicle, ...patch } 
      } 
    } as any);
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
      <SegmentedControl
        shape="pill"
        options={[
          { value: 'manual', label: 'Manual', icon: <MapPin size={13} /> },
          { value: 'car', label: 'Car', icon: <Car size={13} /> },
          { value: 'walk', label: 'Walk', icon: <Footprints size={13} /> },
          { value: 'flight', label: 'Flight', icon: <Plane size={13} /> },
        ]}
        value={calc.mode || 'manual'}
        onValueChange={handleModeChange}
      />

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
              <IconButton 
                variant={editingRoutePoint === 'start' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-full"
                onClick={() => {
                  const active = editingRoutePoint === 'start';
                  setEditingRoutePoint(active ? null : 'start');
                  setEditingItemId(active ? null : item.id);
                }}
              >
                <Crosshair size={14} className={editingRoutePoint === 'start' ? 'animate-pulse text-white' : ''} />
              </IconButton>
            </div>

            {/* End Point */}
            <div className="flex items-center gap-2">
              <InspectorSearchField 
                label="Search or Coordinates..."
                value={calc.endPoint}
                onSelect={setEnd}
                color="bg-red-500/10 text-red-500 border-red-500/20"
              />
              <IconButton 
                variant={editingRoutePoint === 'end' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-full"
                onClick={() => {
                  const active = editingRoutePoint === 'end';
                  setEditingRoutePoint(active ? null : 'end');
                  setEditingItemId(active ? null : item.id);
                }}
              >
                <Crosshair size={14} className={editingRoutePoint === 'end' ? 'animate-pulse text-white' : ''} />
              </IconButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => calculateRoute(false)}
              disabled={loading}
              className="h-8 rounded-full text-xs font-medium border-border/50 hover:bg-secondary/50 group transition-all active:scale-95"
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

          <div className="pt-4 border-t border-border/10 flex flex-col gap-4">
            {/* Vehicle header + enable toggle — available to all users */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Vehicle</span>
              <Switch
                checked={calc.vehicle?.enabled || false}
                onCheckedChange={(v) => updateVehicle({ enabled: v })}
              />
            </div>

            {calc.vehicle?.enabled && (
              <div className="space-y-3">
                {/* Type selector: Dot (free) | Car (Pro) | Plane (Pro) */}
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { type: 'dot', label: 'Dot', icon: <Circle size={12} />, pro: false },
                    { type: 'car', label: 'Car', icon: <Car size={12} />, pro: true },
                    { type: 'plane', label: 'Plane', icon: <Plane size={12} />, pro: true },
                  ] as const).map(({ type, label, icon, pro }) => {
                    const locked = pro && !isPro;
                    const active = (calc.vehicle?.type || 'dot') === type;
                    return (
                      <button
                        key={type}
                        disabled={locked}
                        onClick={() => !locked && updateVehicle({ type })}
                        className={`relative flex flex-col items-center justify-center gap-1 h-12 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all border
                          ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary border-transparent'}
                          ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {icon}
                        {label}
                        {locked && <ProBadge className="absolute -top-1.5 -right-1" />}
                      </button>
                    );
                  })}
                </div>

                {/* Scale slider — works for dot (radius) and 3D models alike */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                    <span>Scale</span>
                    <span>{calc.vehicle?.scale?.toFixed(1) || '1.0'}x</span>
                  </div>
                  <Slider
                    value={[calc.vehicle?.scale || 1]}
                    onValueChange={([v]) => updateVehicle({ scale: v })}
                    min={0.1}
                    max={5}
                    step={0.1}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
