import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Car, Footprints, Plane, Search, Loader2, Crosshair, MapPin, X, Eye,
  Plus, Trash2, GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import type { RouteItem, RouteMode } from '@/store/types';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AirportSearchField } from '@/components/Search/AirportSearchField';
import { SwitchRow, SliderField } from './InspectorShared';
import { applyFreeformPatch, type FreeformPatch } from '@/engine/routeCurves';
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
// Sortable point row (walk / freeform mode)
// ---------------------------------------------------------------------------

interface SortablePointRowProps {
  id: string;
  index: number;
  label: string;
  coords: [number, number];
  isPicking: boolean;
  onPickToggle: () => void;
  onDelete: () => void;
}

const SortablePointRow = ({
  id,
  index,
  label,
  coords,
  isPicking,
  onPickToggle,
  onDelete,
}: SortablePointRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 bg-secondary/30 p-2 rounded-lg border border-border/40"
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
        {...attributes}
        {...listeners}
        title="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      {/* Index badge */}
      <div className="w-5 h-5 rounded-full bg-blue-500 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
        {index + 1}
      </div>

      {/* Coordinates */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-foreground block truncate">
          {label}: {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
        </span>
      </div>

      {/* Pick button */}
      <IconButton
        variant={isPicking ? 'default' : 'outline'}
        size="xs"
        className={`rounded-lg h-7 w-7 shrink-0 ${isPicking ? 'bg-primary text-primary-foreground' : ''}`}
        onClick={onPickToggle}
        title="Move point on map"
      >
        <Crosshair size={12} className={isPicking ? 'animate-pulse text-white' : 'text-muted-foreground'} />
      </IconButton>

      {/* Delete */}
      <IconButton
        variant="ghost"
        size="xs"
        className="rounded-lg h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="Remove point"
      >
        <Trash2 size={12} />
      </IconButton>
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
  const { updateItem, setPreviewRoute, activePicker, startPicking, stopPicking } =
    useProjectStore();
  const [loading, setLoading] = useState(false);
  const calculationSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const storeItem = useProjectStore((s) => s.items[item.id]) as RouteItem | undefined;
  const activeItem = storeItem ?? item;

  const calc = activeItem.calculation || {
    mode: 'car' as const,
    startPoint: [0, 0] as [number, number],
    endPoint: [0, 0] as [number, number],
  };

  const isPickingStart = activePicker?.id === `route-${item.id}-start`;
  const isPickingEnd = activePicker?.id === `route-${item.id}-end`;

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

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calculationSeqRef.current++;
      if (useProjectStore.getState().activePicker?.ownerId === item.id) {
        useProjectStore.getState().stopPicking();
      }
    };
  }, [item.id]);

  const handleModeChange = (mode: RouteMode) => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
    const currentVehicle = calc.vehicle || {
      enabled: false,
      type: 'dot' as const,
      modelId: '',
      scale: 1,
    };
    const vehicle =
      mode === 'flight' && currentVehicle.type === 'dot'
        ? { ...currentVehicle, enabled: true, type: 'plane' as const }
        : currentVehicle;

    updateItem(item.id, vehicleChangePatch(activeItem, { ...calc, mode }, vehicle));
  };

  const calculateRoute = async (saveToItem: boolean) => {
    if (!calc.startPoint || !calc.endPoint || (calc.startPoint[0] === 0 && calc.startPoint[1] === 0)) {
      toast.error('Set start and end points.');
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const seq = ++calculationSeqRef.current;
    setLoading(true);
    try {
      let geojson: GeoJSON.Geometry;
      if (calc.mode === 'car') {
        const result = await getDirections(calc.startPoint, calc.endPoint, calc.mode, abortController.signal);
        geojson = result.geometry;
      } else {
        geojson = calculateFlightArc(calc.startPoint, calc.endPoint);
      }

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

  const setPoint = (key: 'startPoint' | 'endPoint', lngLat: [number, number]) => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
    const current = useProjectStore.getState().items[item.id];
    if (current?.kind !== 'route') return;
    updateItem(item.id, { calculation: { ...(current.calculation ?? calc), [key]: lngLat } });
    setPreviewRoute(null);
  };

  const setStart = (lngLat: [number, number]) => setPoint('startPoint', lngLat);
  const setEnd = (lngLat: [number, number]) => setPoint('endPoint', lngLat);

  /** Applies a freeform edit to the latest stored route (not this render's stale copy). */
  const updateFreeformRoute = (
    patch: FreeformPatch | ((current: NonNullable<RouteItem['calculation']>) => FreeformPatch),
  ) => {
    const current = useProjectStore.getState().items[item.id];
    if (current?.kind !== 'route') return;
    const resolved = typeof patch === 'function' ? patch(current.calculation ?? calc) : patch;
    updateItem(item.id, applyFreeformPatch(current, resolved));
  };

  // Walk freeform: flat sequential point list = [startPoint, ...waypoints, endPoint]
  const allPoints: [number, number][] = calc.mode === 'walk'
    ? [
        ...(calc.startPoint && (calc.startPoint[0] !== 0 || calc.startPoint[1] !== 0) ? [calc.startPoint] : []),
        ...(calc.waypoints ?? []),
        ...(calc.endPoint && (calc.endPoint[0] !== 0 || calc.endPoint[1] !== 0) ? [calc.endPoint] : []),
      ]
    : [];

  // Stable DnD ids — just use index-based strings derived from the points array
  const pointIds = allPoints.map((_, i) => `pt-${i}`);

  const isAddingWp = activePicker?.id === `route-${item.id}-add-wp`;

  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pointIds.indexOf(active.id as string);
    const newIndex = pointIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(allPoints, oldIndex, newIndex);
    const [newStart, ...rest] = reordered;
    const newEnd = rest.length > 0 ? rest.pop()! : newStart;
    updateFreeformRoute({
      startPoint: newStart,
      waypoints: rest,
      endPoint: newEnd,
    });
  };

  const deletePoint = (flatIndex: number) => {
    if (allPoints.length <= 1) {
      // Clear to empty
      updateFreeformRoute({ startPoint: [0, 0], waypoints: [], endPoint: [0, 0] });
      return;
    }
    const next = allPoints.filter((_, i) => i !== flatIndex);
    const [newStart, ...rest] = next;
    const newEnd = rest.length > 0 ? rest.pop()! : newStart;
    updateFreeformRoute({ startPoint: newStart, waypoints: rest, endPoint: newEnd });
  };

  const movePoint = (flatIndex: number, lngLat: [number, number]) => {
    const next = allPoints.map((p, i) => (i === flatIndex ? lngLat : p));
    const [newStart, ...rest] = next;
    const newEnd = rest.length > 0 ? rest.pop()! : newStart;
    updateFreeformRoute({ startPoint: newStart, waypoints: rest, endPoint: newEnd });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <SegmentedControl
        options={[
          { value: 'car', label: 'Drive', icon: <Car size={13} /> },
          { value: 'walk', label: 'Walk', icon: <Footprints size={13} /> },
          { value: 'flight', label: 'Flight', icon: <Plane size={13} /> },
        ]}
        value={calc.mode || 'car'}
        onValueChange={handleModeChange}
        className="h-8"
      />

      {/* Walk — always freeform spline, sequential point list */}
      {calc.mode === 'walk' ? (
        <div className="flex flex-col gap-3">
          {/* Curve controls */}
          <SwitchRow
            label="Smooth Curve"
            sublabel={calc.curved !== false ? 'Bézier spline through points' : 'Straight line segments'}
            checked={calc.curved !== false}
            onChange={(checked) => updateFreeformRoute({ curved: checked })}
          />

          {calc.curved !== false && (
            <SliderField
              label="Curvature"
              value={calc.sharpness ?? 0.85}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={(sharpness) => updateFreeformRoute({ sharpness })}
            />
          )}

          {/* Sequential point list */}
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Points
            </span>

            {allPoints.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">
                No points yet — click below to add your first point.
              </p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pointIds} strategy={verticalListSortingStrategy}>
                {allPoints.map((pt, idx) => {
                  const pickerId = `route-${item.id}-wp-move-${idx}`;
                  const isPickingThis = activePicker?.id === pickerId;
                  return (
                    <SortablePointRow
                      key={pointIds[idx]}
                      id={pointIds[idx]}
                      index={idx}
                      label={`Point ${idx + 1}`}
                      coords={pt}
                      isPicking={isPickingThis}
                      onPickToggle={() => {
                        if (isPickingThis) {
                          stopPicking();
                        } else {
                          startPicking({
                            id: pickerId,
                            ownerId: item.id,
                            prompt: `Move point ${idx + 1}`,
                            onPick: (result) => movePoint(idx, result.lngLat),
                          });
                        }
                      }}
                      onDelete={() => deletePoint(idx)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>

            {/* Append point button */}
            <Button
              type="button"
              variant={isAddingWp ? 'default' : 'outline'}
              size="sm"
              className="w-full h-8 mt-1 text-xs gap-1.5"
              onClick={() => {
                if (isAddingWp) {
                  stopPicking();
                } else {
                  startPicking({
                    id: `route-${item.id}-add-wp`,
                    ownerId: item.id,
                    prompt: 'Point',
                    onPick: (result) => {
                      updateFreeformRoute((current) => {
                        const pts: [number, number][] = [
                          ...(current.startPoint && (current.startPoint[0] !== 0 || current.startPoint[1] !== 0)
                            ? [current.startPoint]
                            : []),
                          ...(current.waypoints ?? []),
                          ...(current.endPoint && (current.endPoint[0] !== 0 || current.endPoint[1] !== 0)
                            ? [current.endPoint]
                            : []),
                          result.lngLat,
                        ];
                        const [s, ...rest] = pts;
                        const e = rest.length > 0 ? rest.pop()! : s;
                        return { startPoint: s, waypoints: rest, endPoint: e };
                      });
                      toast.success('Point added');
                    },
                  });
                }
              }}
            >
              <Plus size={13} />
              {isAddingWp ? 'Click map to place point' : 'Add point on map'}
            </Button>

            <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/40 mt-1 leading-snug">
              💡 <strong>Tip:</strong> Drag the numbered markers on the map to reposition points, or use the grip handles above to reorder.
            </div>
          </div>
        </div>
      ) : (
        /* Car / Flight — standard start + end + calculate flow */
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
      )}
    </div>
  );
};
