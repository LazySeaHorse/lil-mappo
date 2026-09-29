import { useState, useEffect, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Car, Footprints, Plane, Loader2, Crosshair, MapPin, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import type { EndpointRouteCalculation, RouteItem, RouteMode, WalkRouteCalculation } from '@/store/types';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AirportSearchField } from '@/components/Search/AirportSearchField';
import { SwitchRow, SliderField } from './InspectorShared';
import { DEFAULT_SHARPNESS } from '@/engine/routeCurves';
import { convertRouteCalculation, isPlacedPoint, UNSET_POINT } from '@/engine/routeMode';
import { WalkPointList } from './WalkPointList';
import { vehicleChangePatch } from '@/config/vehicles';

// ---------------------------------------------------------------------------
// Shared location search field (car / flight standard flow)
// ---------------------------------------------------------------------------

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
  item,
}: InspectorSearchFieldProps) => {
  const { activePicker, startPicking, stopPicking } = useProjectStore();
  const pickerId = `route-${item.id}-${pointType}`;
  const isPicking = activePicker?.id === pickerId;

  const handleTogglePick = () => {
    if (isPicking) {
      stopPicking();
    } else {
      startPicking({
        id: pickerId,
        ownerId: item.id,
        prompt: pointType === 'start' ? 'Start' : 'End',
        onPick: (result) => {
          onSelect(result.lngLat);
        },
      });
    }
  };

  useEffect(() => {
    return () => {
      if (useProjectStore.getState().activePicker?.id === pickerId) {
        useProjectStore.getState().stopPicking();
      }
    };
  }, [pickerId]);

  const { query, setQuery, suggestions, isOpen, loading, performSearch, handleSelect, clear } =
    useLocationSearch({
      onSelect: (lngLat) => onSelect(lngLat),
      parseCoordinates: true,
    });

  useEffect(() => {
    if (value[0] !== 0 || value[1] !== 0) {
      setQuery(`${value[0].toFixed(5)}, ${value[1].toFixed(5)}`);
    } else {
      setQuery('');
    }
  }, [value, setQuery]);

  return (
    <div className="relative group w-full">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 shrink-0 w-14">
          <div className={`w-2.5 h-2.5 rounded-full ${dotColor} shadow-sm shrink-0`} />
          <span className="text-xs font-medium text-foreground/90">{label}</span>
        </div>

        <div className="relative flex-1">
          <Input
            placeholder="Search address or coordinates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(query);
              }
            }}
            className="h-8 text-xs font-mono pl-3 pr-8 bg-background/50 border-border/50 rounded-lg focus-visible:ring-1 focus-visible:ring-primary/20 focus-visible:ring-inset"
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
          onClick={handleTogglePick}
          title={isPicking ? 'Select a point on the map' : 'Select point on map'}
        >
          <Crosshair
            size={13}
            className={isPicking ? 'animate-pulse text-white' : 'text-muted-foreground'}
          />
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

// ---------------------------------------------------------------------------
// Walk — freehand points
// ---------------------------------------------------------------------------

const WalkPlanner = ({ routeId, calc }: { routeId: string; calc: WalkRouteCalculation }) => {
  const { updateWalkRoute, activePicker, startPicking, stopPicking } = useProjectStore();
  const appendPickerId = `route-${routeId}-append`;
  const movePickerPrefix = `route-${routeId}-move-`;
  const movingIndex = activePicker?.id.startsWith(movePickerPrefix)
    ? Number(activePicker.id.slice(movePickerPrefix.length))
    : null;

  // Removing or reordering shifts indices, so a pending "move point N" pick would land on the wrong point.
  const stopMovePicker = () => {
    if (movingIndex !== null) stopPicking();
  };

  const togglePicker = (id: string, prompt: string, onPick: (lngLat: [number, number]) => void) => {
    if (activePicker?.id === id) {
      stopPicking();
      return;
    }
    startPicking({ id, ownerId: routeId, prompt, onPick: (result) => onPick(result.lngLat) });
  };

  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        label="Smooth Curve"
        sublabel={calc.curved ? 'Bézier spline through points' : 'Straight line segments'}
        checked={calc.curved}
        onChange={(curved) => updateWalkRoute(routeId, { curved })}
      />

      {calc.curved && (
        <SliderField
          label="Curvature"
          value={calc.sharpness ?? DEFAULT_SHARPNESS}
          min={0.1}
          max={1.0}
          step={0.05}
          onChange={(sharpness) => updateWalkRoute(routeId, { sharpness })}
        />
      )}

      <div className="flex flex-col gap-2 pt-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Points
        </span>

        {calc.points.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">
            No points yet — click below to add your first point.
          </p>
        )}

        <WalkPointList
          points={calc.points}
          onReorder={(from, to) => {
            stopMovePicker();
            updateWalkRoute(routeId, (c) => ({ points: arrayMove(c.points, from, to) }));
          }}
          onRemove={(index) => {
            stopMovePicker();
            updateWalkRoute(routeId, (c) => ({ points: c.points.filter((_, i) => i !== index) }));
          }}
          isAppending={activePicker?.id === appendPickerId}
          onToggleAppend={() =>
            togglePicker(appendPickerId, 'Point', (lngLat) => {
              updateWalkRoute(routeId, (c) => ({ points: [...c.points, lngLat] }));
              toast.success('Point added');
            })
          }
          movingIndex={movingIndex}
          onToggleMove={(index) =>
            togglePicker(`${movePickerPrefix}${index}`, `Move point ${index + 1}`, (lngLat) =>
              updateWalkRoute(routeId, (c) => ({
                points: c.points.map((p, i) => (i === index ? lngLat : p)),
              })),
            )
          }
        />

        <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/40 mt-1 leading-snug">
          💡 <strong>Tip:</strong> Drag the numbered markers on the map to reposition points, or use the grip handles above to reorder.
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Car / flight — two endpoints, computed path
// ---------------------------------------------------------------------------

const EndpointPlanner = ({ item, calc }: { item: RouteItem; calc: EndpointRouteCalculation }) => {
  const { updateItem, setPreviewRoute, activePicker, startPicking, stopPicking } = useProjectStore();
  const [loading, setLoading] = useState(false);
  const calculationSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isPickingStart = activePicker?.id === `route-${item.id}-start`;
  const isPickingEnd = activePicker?.id === `route-${item.id}-end`;

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calculationSeqRef.current++;
    };
  }, [item.id]);

  const cancelCalculation = () => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
  };

  const setPoint = (key: 'startPoint' | 'endPoint', lngLat: [number, number]) => {
    cancelCalculation();
    const current = useProjectStore.getState().items[item.id];
    if (current?.kind !== 'route' || current.calculation?.mode === 'walk') return;
    updateItem(item.id, { calculation: { ...(current.calculation ?? calc), [key]: lngLat } });
    setPreviewRoute(null);
  };

  const setStart = (lngLat: [number, number]) => setPoint('startPoint', lngLat);
  const setEnd = (lngLat: [number, number]) => setPoint('endPoint', lngLat);

  const handleTogglePick = (pointType: 'start' | 'end') => {
    const pickerId = `route-${item.id}-${pointType}`;
    if (activePicker?.id === pickerId) {
      stopPicking();
    } else {
      startPicking({
        id: pickerId,
        ownerId: item.id,
        prompt: pointType === 'start' ? 'Start' : 'End',
        onPick: (result) => {
          if (pointType === 'start') setStart(result.lngLat);
          else setEnd(result.lngLat);
        },
      });
    }
  };

  const calculateRoute = async (saveToItem: boolean) => {
    if (!isPlacedPoint(calc.startPoint) || !isPlacedPoint(calc.endPoint)) {
      toast.error('Set start and end points.');
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const seq = ++calculationSeqRef.current;
    setLoading(true);
    try {
      const geojson: GeoJSON.Geometry = calc.mode === 'car'
        ? (await getDirections(calc.startPoint, calc.endPoint, abortController.signal)).geometry
        : calculateFlightArc(calc.startPoint, calc.endPoint);

      if (seq !== calculationSeqRef.current || abortController.signal.aborted) return;

      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geojson, properties: {} }],
      };

      if (saveToItem) {
        updateItem(item.id, { geojson: featureCollection });
        toast.success('Route updated.');
        setPreviewRoute(null);
      } else {
        setPreviewRoute(featureCollection);
        toast.success('Route preview is ready.');
      }
    } catch (err: unknown) {
      if (
        abortController.signal.aborted ||
        seq !== calculationSeqRef.current ||
        (err instanceof Error && err.name === 'AbortError')
      )
        return;
      toast.error('Cannot calculate route.');
    } finally {
      if (seq === calculationSeqRef.current) setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {calc.mode === 'flight' ? (
        <>
          <AirportSearchField
            label="Departure"
            placeholder="Departure airport or city (e.g. JFK)..."
            value={calc.startPoint}
            onSelect={setStart}
            color="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
            isPicking={isPickingStart}
            onStartPick={() => handleTogglePick('start')}
          />
          <AirportSearchField
            label="Arrival"
            placeholder="Arrival airport or city (e.g. LHR)..."
            value={calc.endPoint}
            onSelect={setEnd}
            color="bg-rose-500/10 text-rose-500 border-rose-500/20"
            isPicking={isPickingEnd}
            onStartPick={() => handleTogglePick('end')}
          />
        </>
      ) : (
        <>
          <InspectorSearchField
            label="Start"
            pointType="start"
            item={item}
            value={calc.startPoint}
            onSelect={setStart}
            dotColor="bg-emerald-500"
          />
          <InspectorSearchField
            label="End"
            pointType="end"
            item={item}
            value={calc.endPoint}
            onSelect={setEnd}
            dotColor="bg-rose-500"
          />
        </>
      )}

      <div className="flex flex-col gap-2.5 pt-1">
        <Button
          type="button"
          onClick={() => calculateRoute(true)}
          disabled={loading}
          className="w-full h-10 py-2.5 px-4 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : 'Apply route'}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => calculateRoute(false)}
          disabled={loading}
          className="w-full h-10 py-2.5 px-4 rounded-lg text-xs font-medium shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Eye size={15} className="text-muted-foreground" />
          <span>Preview route</span>
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main RoutePlanner
// ---------------------------------------------------------------------------

interface RoutePlannerProps {
  item: RouteItem;
}

export const RoutePlanner = ({ item }: RoutePlannerProps) => {
  const updateItem = useProjectStore((s) => s.updateItem);
  const storeItem = useProjectStore((s) => s.items[item.id]) as RouteItem | undefined;
  const activeItem = storeItem ?? item;
  const calc = activeItem.calculation ?? convertRouteCalculation(undefined, 'car');

  useEffect(() => {
    return () => {
      if (useProjectStore.getState().activePicker?.ownerId === item.id) {
        useProjectStore.getState().stopPicking();
      }
    };
  }, [item.id]);

  const handleModeChange = (mode: RouteMode) => {
    const store = useProjectStore.getState();
    if (store.activePicker?.ownerId === item.id) store.stopPicking();
    store.setPreviewRoute(null);

    const next = convertRouteCalculation(calc, mode);
    const currentVehicle = next.vehicle ?? { enabled: false, type: 'dot' as const, modelId: '', scale: 1 };
    const vehicle =
      mode === 'flight' && currentVehicle.type === 'dot'
        ? { ...currentVehicle, enabled: true, type: 'plane' as const }
        : currentVehicle;

    updateItem(item.id, vehicleChangePatch(activeItem, next, vehicle));
  };

  return (
    <div className="flex flex-col gap-3.5">
      <SegmentedControl
        options={[
          { value: 'car', label: 'Drive', icon: <Car size={13} /> },
          { value: 'walk', label: 'Walk', icon: <Footprints size={13} /> },
          { value: 'flight', label: 'Flight', icon: <Plane size={13} /> },
        ]}
        value={calc.mode}
        onValueChange={handleModeChange}
        className="h-8"
      />

      {calc.mode === 'walk'
        ? <WalkPlanner routeId={item.id} calc={calc} />
        : <EndpointPlanner key={calc.mode} item={activeItem} calc={calc} />}
    </div>
  );
};
