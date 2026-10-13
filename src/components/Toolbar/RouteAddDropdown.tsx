import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapPicker } from '@/hooks/useMapPicker';
import { useEndpointRoutePath } from '@/hooks/useEndpointRoutePath';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { useGuestLock } from '@/hooks/useGuestLock';
import { Button } from '@/components/ui/button';
import {
  Car, Footprints, Plane, Search, Loader2,
  Navigation, Upload, Lock, Plus, Check, Compass,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import type { RouteItem, RouteMode } from '@/store/types';
import { createEndpointRouteItem, createWalkRouteItem, defaultEndpointRouteName } from '@/store/itemFactories';
import { SearchField } from '../Search/SearchField';
import { AirportSearchField } from '../Search/AirportSearchField';
import { IconButton } from '@/components/ui/icon-button';
import { ToolbarDropdownPanel } from '@/components/ui/toolbar-dropdown-panel';
import { PanelHeader } from '@/components/ui/panel-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { SegmentedControlOption } from '@/components/ui/segmented-control';
import { SectionLabel } from '@/components/ui/field';
import { arrayMove } from '@dnd-kit/sortable';
import { createWalkCalculation } from '@/engine/routeCurves';
import { extractLineCoords } from '@/engine/geoUtils';
import { isPlacedPoint } from '@/engine/routeMode';
import { reportRouteAdded } from '@/lib/analytics/reporters';
import { WalkPointList } from '../Inspector/WalkPointList';
import { SwitchRow } from '../Inspector/InspectorShared';

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

const ROUTE_MODE_OPTIONS: SegmentedControlOption<RouteMode>[] = [
  { value: 'car', label: 'Car', icon: <Car size={12} /> },
  { value: 'walk', label: 'Walk', icon: <Footprints size={12} /> },
  { value: 'flight', label: 'Flight', icon: <Plane size={12} /> },
];

const PATH_MESSAGES = { missingEndpoints: 'Set start and end', failed: 'Calculation failed' };

const ENDPOINT_COLORS = {
  start: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  end: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const ENDPOINT_FIELD_COPY = {
  car: {
    start: { label: 'Start location...' },
    end: { label: 'End location...' },
  },
  flight: {
    start: { label: 'Departure airport...', placeholder: 'Departure airport or city (e.g. JFK, LHR)...' },
    end: { label: 'Arrival airport...', placeholder: 'Arrival airport or city (e.g. DXB, CDG)...' },
  },
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
  const { addItem, selectItem, previewRoute, setPreviewRoute, setDraftWalk } = useProjectStore(
    useShallow(s => ({
      addItem: s.addItem,
      selectItem: s.selectItem,
      previewRoute: s.previewRoute,
      setPreviewRoute: s.setPreviewRoute,
      setDraftWalk: s.setDraftWalk,
    }))
  );

  const [mode, setMode] = useState<RouteMode>('car');

  // Car / flight state
  const [start, setStart] = useState<[number, number]>([0, 0]);
  const [startName, setStartName] = useState('');
  const [end, setEnd] = useState<[number, number]>([0, 0]);
  const [endName, setEndName] = useState('');
  const path = useEndpointRoutePath(undefined, PATH_MESSAGES);
  const frame = useFrameOnMap();
  const isGuest = useGuestLock();

  // Walk state — flat sequential list of points
  const [walkPoints, setWalkPoints] = useState<[number, number][]>([]);
  const [walkCurved, setWalkCurved] = useState(true);

  /** Drops any path request in flight and the preview drawn from the old inputs. */
  const discardPath = () => {
    path.cancel();
    if (useProjectStore.getState().previewRoute) useProjectStore.getState().setPreviewRoute(null);
  };

  const resetAll = () => {
    discardPath();
    setStart([0, 0]);
    setStartName('');
    setEnd([0, 0]);
    setEndName('');
    setWalkPoints([]);
    setWalkCurved(true);
  };

  const handleModeChange = (newMode: RouteMode) => {
    discardPath();
    setMode(newMode);
  };

  const handleStartChange = (lngLat: [number, number], name?: string) => {
    discardPath();
    setStart(lngLat);
    setStartName(name || '');
  };

  const handleEndChange = (lngLat: [number, number], name?: string) => {
    discardPath();
    setEnd(lngLat);
    setEndName(name || '');
  };

  // Live walk preview: mirror the draft into the store so the map draws it as points change.
  useEffect(() => {
    const draft = isOpen && mode === 'walk' && walkPoints.length > 0
      ? createWalkCalculation(walkPoints)
      : null;
    setDraftWalk(draft && { ...draft, curved: walkCurved });
  }, [isOpen, mode, walkPoints, walkCurved, setDraftWalk]);

  // Cleanup on close / unmount (the path hook cancels its own request on unmount)
  useEffect(() => {
    if (!isOpen) discardPath();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    return () => {
      const store = useProjectStore.getState();
      store.setDraftWalk(null);
      if (store.previewRoute) store.setPreviewRoute(null);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Map pickers
  // ---------------------------------------------------------------------------

  const { isPicking: isAppending, toggle: toggleAppend } = useMapPicker('walk-append', {
    prompt: 'Point',
    enabled: isOpen,
    onPick: (result) => {
      setWalkPoints((pts) => [...pts, result.lngLat]);
      toast.success('Point added');
    },
  });
  const { isPicking: isPickingStart, toggle: handleTogglePickStart } = useMapPicker('route-start', {
    prompt: 'Start',
    enabled: isOpen,
    onPick: (result) => handleStartChange(result.lngLat, result.name),
  });
  const { isPicking: isPickingEnd, toggle: handleTogglePickEnd } = useMapPicker('route-end', {
    prompt: 'End',
    enabled: isOpen,
    onPick: (result) => handleEndChange(result.lngLat, result.name),
  });

  // ---------------------------------------------------------------------------
  // Calculate + add
  // ---------------------------------------------------------------------------

  const calculate = () => {
    if (mode === 'walk') return;
    void path.calculate(mode, start, end, (geojson) => {
      setPreviewRoute(geojson);
      frame.frameGeometry(geojson);
      toast.success('Path preview ready');
    });
  };

  const insertItem = (item: RouteItem, pointCount: number) => {
    addItem(item);
    selectItem(item.id);
    // After selecting: the inspector opens with the item and takes room on the right.
    frame.frameGeometry(item.geojson);
    reportRouteAdded(mode, pointCount);
    resetAll();
    onOpenChange(false);
  };

  const handleAddCarFlight = () => {
    if (!previewRoute || mode === 'walk') return;
    insertItem(
      createEndpointRouteItem({
        mode,
        geojson: previewRoute,
        start,
        end,
        startName,
        endName,
        name: defaultEndpointRouteName(mode, startName, endName),
        startTime: useProjectStore.getState().playheadTime,
      }),
      extractLineCoords(previewRoute).length,
    );
  };

  // Walk — append-only, insert straight into timeline
  const handleAddWalk = () => {
    if (walkPoints.length < 2) {
      toast.error('Add at least 2 points to create a walk path.');
      return;
    }
    insertItem(
      createWalkRouteItem({ points: walkPoints, curved: walkCurved, startTime: useProjectStore.getState().playheadTime }),
      walkPoints.length,
    );
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
      subtitle="Select travel mode and route points"
    >
      <SegmentedControl<RouteMode>
        options={ROUTE_MODE_OPTIONS}
        value={mode}
        onValueChange={handleModeChange}
      />
    </PanelHeader>
  );

  let primaryAction: React.ReactNode;
  if (mode === 'walk') {
    primaryAction = (
      <Button
        variant={walkPoints.length >= 2 ? 'default' : 'secondary'}
        size="sm"
        onClick={handleAddWalk}
        disabled={walkPoints.length < 2}
        className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg shadow-lg shadow-primary/10 transition-all"
      >
        <Plus size={16} /> Insert walk path
      </Button>
    );
  } else if (!previewRoute) {
    primaryAction = (
      <Button
        variant="secondary"
        size="sm"
        onClick={calculate}
        disabled={path.loading}
        className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium bg-secondary/50 hover:bg-secondary border border-border/50 rounded-lg transition-all"
      >
        {path.loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview path
      </Button>
    );
  } else {
    primaryAction = (
      <Button
        variant="default"
        size="sm"
        onClick={handleAddCarFlight}
        className="w-full h-9 flex items-center justify-center gap-2 text-xs font-medium rounded-lg shadow-lg shadow-primary/10 transition-all"
      >
        <Plus size={16} /> Insert route
      </Button>
    );
  }

  const footer = (
    <div className="space-y-2">
      {primaryAction}
      <Button
        variant="ghost"
        size="sm"
        onClick={onImportClick}
        className="w-full h-8 flex items-center justify-center gap-2 text-xs text-muted-foreground font-medium hover:text-foreground"
      >
        {isGuest ? <Lock size={13} /> : <Upload size={13} />}
        {isGuest ? 'Sign in to import KML / GPX data' : 'Import KML / GPX data'}
      </Button>
    </div>
  );

  const EndpointField = mode === 'flight' ? AirportSearchField : SearchField;
  const fieldCopy = mode === 'flight' ? ENDPOINT_FIELD_COPY.flight : ENDPOINT_FIELD_COPY.car;

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
          <SwitchRow
            label="Smooth Curve"
            sublabel={walkCurved ? 'Bézier spline through points' : 'Straight line segments'}
            checked={walkCurved}
            onChange={setWalkCurved}
          />

          <SectionLabel>Walk points</SectionLabel>

          {walkPoints.length === 0 && (
            <EmptyState
              variant="dropdown"
              icon={Compass}
              title="No points yet"
              description="Click below to add points. Each click adds a point to the path."
            />
          )}

          <WalkPointList
            points={walkPoints}
            onReorder={(from, to) => setWalkPoints((pts) => arrayMove(pts, from, to))}
            onRemove={(index) => setWalkPoints((pts) => pts.filter((_, i) => i !== index))}
            isAppending={isAppending}
            onToggleAppend={toggleAppend}
          />
        </div>
      ) : (
        /* Car / flight — start + end */
        <div className="space-y-4">
          <SectionLabel>{mode === 'flight' ? 'Airport route' : 'Route points'}</SectionLabel>
          <EndpointField
            {...fieldCopy.start}
            value={start}
            name={startName}
            onSelect={handleStartChange}
            color={ENDPOINT_COLORS.start}
            isPicking={isPickingStart}
            onStartPick={handleTogglePickStart}
          />
          <div className="relative h-2 ml-4 border-l-2 border-dashed border-border/50" />
          <EndpointField
            {...fieldCopy.end}
            value={end}
            name={endName}
            onSelect={handleEndChange}
            color={ENDPOINT_COLORS.end}
            isPicking={isPickingEnd}
            onStartPick={handleTogglePickEnd}
          />

          {!previewRoute && !isPlacedPoint(start) && !isPlacedPoint(end) && (
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
                  <span className="text-xs font-medium text-foreground/80">Route calculated</span>
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
