import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { getDirections } from '@/services/directions';
import { calculateFlightArc } from '@/services/flightPath';
import { Button } from '@/components/ui/button';
import {
  Car, Footprints, Plane, Search, Loader2,
  Navigation, Upload, Plus, Check, Compass, Trash2, GripVertical,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import type { RouteItem, RouteMode } from '@/store/types';
import { SearchField } from '../Search/SearchField';
import { AirportSearchField } from '../Search/AirportSearchField';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { SegmentedControlOption } from '@/components/ui/segmented-control';
import { SectionLabel } from '@/components/ui/field';
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
import { buildRouteFeatureCollection } from '@/engine/routeCurves';

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

const ROUTE_MODE_OPTIONS: SegmentedControlOption<RouteMode>[] = [
  { value: 'car', label: 'Car', icon: <Car size={12} /> },
  { value: 'walk', label: 'Walk', icon: <Footprints size={12} /> },
  { value: 'flight', label: 'Flight', icon: <Plane size={12} /> },
];

// ---------------------------------------------------------------------------
// Tiny sortable row used in the walk point list
// ---------------------------------------------------------------------------

interface SortableWalkPointRowProps {
  id: string;
  index: number;
  coords: [number, number];
  onDelete: () => void;
}

const SortableWalkPointRow = ({ id, index, coords, onDelete }: SortableWalkPointRowProps) => {
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
      className="flex items-center gap-2 bg-secondary/30 p-1.5 rounded-lg border border-border/40"
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} />
      </button>
      <div className="w-4 h-4 rounded-full bg-blue-500 text-white font-bold text-[9px] flex items-center justify-center shrink-0">
        {index + 1}
      </div>
      <span className="text-xs font-mono text-foreground/80 flex-1 truncate">
        {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
      </span>
      <IconButton
        variant="ghost"
        size="xs"
        className="h-6 w-6 rounded text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="Remove point"
      >
        <Trash2 size={11} />
      </IconButton>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const RouteAddDropdown = ({
  onImportClick,
  isOpen,
  onOpenChange,
}: {
  onImportClick: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const {
    addItem, selectItem, playheadTime, previewRoute, setPreviewRoute,
    activePicker, startPicking, stopPicking,
  } = useProjectStore();

  const [mode, setMode] = useState<RouteMode>('car');

  // Car / flight state
  const [start, setStart] = useState<[number, number]>([0, 0]);
  const [startName, setStartName] = useState('');
  const [end, setEnd] = useState<[number, number]>([0, 0]);
  const [endName, setEndName] = useState('');
  const [loading, setLoading] = useState(false);

  // Walk state — flat sequential list of points
  const [walkPoints, setWalkPoints] = useState<[number, number][]>([]);

  const calculationSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetAll = () => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
    setStart([0, 0]);
    setStartName('');
    setEnd([0, 0]);
    setEndName('');
    setWalkPoints([]);
    setPreviewRoute(null);
  };

  const handleModeChange = (newMode: RouteMode) => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
    setMode(newMode);
    setPreviewRoute(null);
  };

  const handleStartChange = (lngLat: [number, number], name?: string) => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
    setStart(lngLat);
    setStartName(name || '');
    setPreviewRoute(null);
  };

  const handleEndChange = (lngLat: [number, number], name?: string) => {
    abortControllerRef.current?.abort();
    calculationSeqRef.current++;
    setLoading(false);
    setEnd(lngLat);
    setEndName(name || '');
    setPreviewRoute(null);
  };

  // Cleanup on close / unmount
  useEffect(() => {
    if (!isOpen) {
      abortControllerRef.current?.abort();
      calculationSeqRef.current++;
      const currentId = useProjectStore.getState().activePicker?.id;
      if (currentId === 'route-start' || currentId === 'route-end' || currentId === 'walk-append') {
        useProjectStore.getState().stopPicking();
      }
      if (useProjectStore.getState().previewRoute) {
        useProjectStore.getState().setPreviewRoute(null);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      // eslint-disable-next-line react-hooks/exhaustive-deps
      calculationSeqRef.current++;
      const currentId = useProjectStore.getState().activePicker?.id;
      if (currentId === 'route-start' || currentId === 'route-end' || currentId === 'walk-append') {
        useProjectStore.getState().stopPicking();
      }
      if (useProjectStore.getState().previewRoute) {
        useProjectStore.getState().setPreviewRoute(null);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Car / flight calculate + add
  // ---------------------------------------------------------------------------

  const isPickingStart = activePicker?.id === 'route-start';
  const isPickingEnd = activePicker?.id === 'route-end';

  const handleTogglePickStart = () => {
    if (isPickingStart) {
      stopPicking();
    } else {
      startPicking({
        id: 'route-start',
        prompt: 'Start',
        onPick: (result) => handleStartChange(result.lngLat, result.name),
      });
    }
  };

  const handleTogglePickEnd = () => {
    if (isPickingEnd) {
      stopPicking();
    } else {
      startPicking({
        id: 'route-end',
        prompt: 'End',
        onPick: (result) => handleEndChange(result.lngLat, result.name),
      });
    }
  };

  const calculate = async () => {
    if (start[0] === 0 || end[0] === 0) {
      toast.error('Set start and end');
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const seq = ++calculationSeqRef.current;
    setLoading(true);
    try {
      let geojson: GeoJSON.Geometry;
      if (mode === 'car') {
        const res = await getDirections(start, end, mode, abortController.signal);
        geojson = res.geometry;
      } else {
        geojson = calculateFlightArc(start, end);
      }
      if (seq !== calculationSeqRef.current || abortController.signal.aborted) return;
      setPreviewRoute({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geojson, properties: {} }],
      });
      toast.success('Path preview ready');
    } catch (e: unknown) {
      if (
        abortController.signal.aborted ||
        seq !== calculationSeqRef.current ||
        (e instanceof Error && e.name === 'AbortError')
      )
        return;
      toast.error('Calculation failed');
    } finally {
      if (seq === calculationSeqRef.current) setLoading(false);
    }
  };

  const handleAddCarFlight = () => {
    if (!previewRoute) return;

    const id = nanoid();
    const flightName =
      startName && endName
        ? `${startName} → ${endName}`
        : `${startName || 'Departure'} → ${endName || 'Arrival'}`;
    const name =
      mode === 'flight'
        ? flightName
        : `${startName || 'Start'} to ${endName || 'End'}`;

    const item: RouteItem = {
      kind: 'route',
      id,
      name,
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
        animationType: 'draw' as const,
        cometTrailLength: 0.2,
      },
      calculation: {
        mode,
        startPoint: start,
        endPoint: end,
        waypoints: [],
        vehicle: {
          enabled: true,
          type: mode === 'flight' ? ('plane' as const) : ('dot' as const),
          modelId: '',
          scale: 1,
        },
      },
      easing: 'easeInOutQuad',
    };

    addItem(item);
    selectItem(id);
    resetAll();
    onOpenChange(false);
  };

  // ---------------------------------------------------------------------------
  // Walk — append-only, insert straight into timeline
  // ---------------------------------------------------------------------------

  const isAppending = activePicker?.id === 'walk-append';

  const walkPointIds = walkPoints.map((_, i) => `wpt-${i}`);

  const sensors = useSensors(useSensor(PointerSensor));

  const handleWalkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = walkPointIds.indexOf(active.id as string);
    const newIdx = walkPointIds.indexOf(over.id as string);
    if (oldIdx === -1 || newIdx === -1) return;
    setWalkPoints((pts) => arrayMove(pts, oldIdx, newIdx));
  };

  const handleAddWalk = () => {
    if (walkPoints.length < 2) {
      toast.error('Add at least 2 points to create a walk path.');
      return;
    }

    const id = nanoid();
    const [newStart, ...rest] = walkPoints;
    const newEnd = rest.pop()!;
    const waypoints = rest;

    const geojson = buildRouteFeatureCollection(walkPoints, { curved: true, sharpness: 0.85 });

    const item: RouteItem = {
      kind: 'route',
      id,
      name: 'Walk path',
      geojson,
      startTime: playheadTime,
      endTime: playheadTime + 5,
      style: {
        color: '#3b82f6',
        width: 4,
        glow: true,
        glowColor: '#3b82f6',
        glowWidth: 12,
        trailFade: false,
        trailFadeLength: 0.3,
        dashPattern: null,
        animationType: 'draw' as const,
        cometTrailLength: 0.2,
      },
      calculation: {
        mode: 'walk',
        startPoint: newStart,
        endPoint: newEnd,
        waypoints,
        curved: true,
        sharpness: 0.85,
        vehicle: {
          enabled: true,
          type: 'dot' as const,
          modelId: '',
          scale: 1,
        },
      },
      easing: 'easeInOutQuad',
    };

    addItem(item);
    selectItem(id);
    resetAll();
    onOpenChange(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const trigger = (
    <IconButton
      variant={isOpen ? 'toolbar-active' : 'toolbar'}
      size="sm"
      title="Plan Route"
      data-walkthrough="add-route"
    >
      <Navigation size={18} />
    </IconButton>
  );

  const header = (
    <PanelHeader
      icon={<Navigation size={16} />}
      title="Plan Route"
      subtitle="Choose travel mode & points"
    >
      <SegmentedControl<RouteMode>
        options={ROUTE_MODE_OPTIONS}
        value={mode}
        onValueChange={handleModeChange}
      />
    </PanelHeader>
  );

  // Footer differs per mode
  const footer =
    mode === 'walk' ? (
      <div className="space-y-2">
        <Button
          variant={walkPoints.length >= 2 ? 'default' : 'secondary'}
          size="sm"
          onClick={handleAddWalk}
          disabled={walkPoints.length < 2}
          className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg shadow-lg shadow-primary/10 transition-all"
        >
          <Plus size={16} /> Insert walk path
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onImportClick}
          className="w-full h-8 flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium hover:text-foreground"
        >
          <Upload size={13} /> Import KML / GPX data
        </Button>
      </div>
    ) : (
      <div className="space-y-2">
        {!previewRoute ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={calculate}
            disabled={loading}
            className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium bg-secondary/50 hover:bg-secondary border border-border/50 rounded-lg transition-all"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview path
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleAddCarFlight}
            className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg shadow-lg shadow-primary/10 transition-all"
          >
            <Plus size={16} /> Insert route
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onImportClick}
          className="w-full h-8 flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium hover:text-foreground"
        >
          <Upload size={13} /> Import KML / GPX data
        </Button>
      </div>
    );

  return (
    <ToolbarDropdownPanel
      open={isOpen}
      onOpenChange={onOpenChange}
      trigger={trigger}
      header={header}
      footer={footer}
    >
      {/* Walk mode — sequential point list */}
      {mode === 'walk' ? (
        <div className="space-y-3">
          <SectionLabel>Walk points</SectionLabel>

          {walkPoints.length === 0 && (
            <EmptyState
              variant="dropdown"
              icon={Compass}
              title="No points yet"
              description="Click below to start adding points sequentially. Each click appends to the path."
            />
          )}

          {walkPoints.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleWalkDragEnd}
            >
              <SortableContext items={walkPointIds} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5">
                  {walkPoints.map((pt, idx) => (
                    <SortableWalkPointRow
                      key={walkPointIds[idx]}
                      id={walkPointIds[idx]}
                      index={idx}
                      coords={pt}
                      onDelete={() => setWalkPoints((pts) => pts.filter((_, i) => i !== idx))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <Button
            type="button"
            variant={isAppending ? 'default' : 'outline'}
            size="sm"
            className="w-full h-8 text-xs gap-1.5"
            onClick={() => {
              if (isAppending) {
                stopPicking();
              } else {
                startPicking({
                  id: 'walk-append',
                  prompt: 'Point',
                  onPick: (result) => {
                    setWalkPoints((pts) => [...pts, result.lngLat]);
                    toast.success('Point added');
                  },
                });
              }
            }}
          >
            <Plus size={13} />
            {isAppending ? 'Click map to place point' : 'Add point on map'}
          </Button>
        </div>
      ) : (
        /* Car / flight — start + end */
        <div className="space-y-4">
          <SectionLabel>{mode === 'flight' ? 'Airport route' : 'Route points'}</SectionLabel>
          {mode === 'flight' ? (
            <>
              <AirportSearchField
                label="Departure airport..."
                placeholder="Departure airport or city (e.g. JFK, LHR)..."
                value={start}
                name={startName}
                onSelect={handleStartChange}
                color="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                isPicking={isPickingStart}
                onStartPick={handleTogglePickStart}
              />
              <div className="relative h-2 ml-4 border-l-2 border-dashed border-border/50" />
              <AirportSearchField
                label="Arrival airport..."
                placeholder="Arrival airport or city (e.g. DXB, CDG)..."
                value={end}
                name={endName}
                onSelect={handleEndChange}
                color="bg-rose-500/10 text-rose-500 border-rose-500/20"
                isPicking={isPickingEnd}
                onStartPick={handleTogglePickEnd}
              />
            </>
          ) : (
            <>
              <SearchField
                label="Start location..."
                value={start}
                name={startName}
                onSelect={handleStartChange}
                color="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                isPicking={isPickingStart}
                onStartPick={handleTogglePickStart}
              />
              <div className="relative h-2 ml-4 border-l-2 border-dashed border-border/50" />
              <SearchField
                label="End location..."
                value={end}
                name={endName}
                onSelect={handleEndChange}
                color="bg-rose-500/10 text-rose-500 border-rose-500/20"
                isPicking={isPickingEnd}
                onStartPick={handleTogglePickEnd}
              />
            </>
          )}

          {!previewRoute && start[0] === 0 && end[0] === 0 && (
            <EmptyState
              variant="dropdown"
              icon={Compass}
              title="Plan your journey"
              description="Select start and end points or click on the map to calculate a route."
            />
          )}

          {previewRoute && (
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-bottom-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-primary" />
                  <span className="text-xs font-medium text-foreground/80">Path validated</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreviewRoute(null)}
                  className="h-6 text-[10px]"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </ToolbarDropdownPanel>
  );
};
