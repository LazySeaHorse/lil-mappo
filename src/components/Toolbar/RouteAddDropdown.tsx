import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useShallow } from 'zustand/react/shallow';
import { useMapPicker } from '@/hooks/useMapPicker';
import { useEndpointRoutePath } from '@/hooks/useEndpointRoutePath';
import { useFrameOnMap } from '@/hooks/useFrameOnMap';
import { useGuestLock } from '@/hooks/useGuestLock';
import { useSubscription } from '@/hooks/useSubscription';
import { isWanderer } from '@/lib/cloudAccess';
import { useWalkthroughStore } from '@/components/Onboarding/useWalkthroughStore';
import { Button } from '@/components/ui/button';
import {
  Car, Footprints, Plane, Search, Loader2,
  Navigation, Upload, Lock, Plus, Check, Compass,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import type { RouteItem, RouteMode } from '@/store/types';
import { createEndpointRouteItem, createWalkRouteItem, defaultEndpointRouteName } from '@/store/itemFactories';
import { HubSpokeList, SpokeTimingControls } from './HubSpokeList';
import { SearchField } from '../Search/SearchField';
import { AirportSearchField } from '../Search/AirportSearchField';
import { LabelledField } from '../Search/LabelledField';
import { HUB_SPOKE_TERMS, PLACE_FIELD_TERMS } from '@/lib/terms';
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
import {
  DEFAULT_SPOKE_GAP, emptySpoke, placedSpokes, spokeEndpoints,
  type Spoke, type SpokeSide, type SpokeTiming,
} from '@/engine/hubSpoke';
import { useSpokePaths } from '@/hooks/useSpokePaths';
import { createHubRoutes } from '@/services/hubRoutes';
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
  const { addItem, selectItem, previewRoute, setPreviewRoute, setPreviewSpokes, setDraftWalk } = useProjectStore(
    useShallow(s => ({
      addItem: s.addItem,
      selectItem: s.selectItem,
      previewRoute: s.previewRoute,
      setPreviewRoute: s.setPreviewRoute,
      setPreviewSpokes: s.setPreviewSpokes,
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
  const { data: subscription } = useSubscription();
  const isPro = isWanderer(subscription);

  // Hub and spoke: one side is a list of places, and the other side is the hub they share.
  const [hubSide, setHubSide] = useState<SpokeSide | null>(null);
  const [spokes, setSpokes] = useState<Spoke[]>([]);
  const [timing, setTiming] = useState<SpokeTiming>('staggered');
  const [gap, setGap] = useState(DEFAULT_SPOKE_GAP);

  // Walk state — flat sequential list of points
  const [walkPoints, setWalkPoints] = useState<[number, number][]>([]);
  const [walkCurved, setWalkCurved] = useState(true);

  // The quick tour waits for a start and an end place.
  useEffect(() => {
    if (isOpen) useWalkthroughStore.getState().recordRouteEndpoints(isPlacedPoint(start), isPlacedPoint(end));
  }, [isOpen, start, end]);

  const isHub = hubSide !== null && mode !== 'walk';
  const hub = hubSide === 'start' ? end : start;
  const hubName = hubSide === 'start' ? endName : startName;
  const spokePaths = useSpokePaths(
    { mode: mode === 'flight' ? 'flight' : 'car', side: hubSide ?? 'end', hub, hubName, spokes },
    isHub && isOpen,
  );
  const readySpokes = isHub
    ? placedSpokes(spokes, hub).filter((s) => spokePaths[s.id]?.status === 'ready')
    : [];
  const placedCount = isHub ? placedSpokes(spokes, hub).length : 0;
  const spokesLoading = Object.values(spokePaths).some((p) => p.status === 'loading');

  // Live preview: a line for every spoke whose path is ready.
  useEffect(() => {
    setPreviewSpokes(
      isOpen
        ? readySpokes.flatMap((s) => {
            const path = spokePaths[s.id];
            return path?.status === 'ready' ? [{ id: s.id, geojson: path.geojson }] : [];
          })
        : [],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, spokePaths]);

  /** Drops any path request in flight and the preview drawn from the old inputs. */
  const discardPath = () => {
    path.cancel();
    if (useProjectStore.getState().previewRoute) useProjectStore.getState().setPreviewRoute(null);
  };

  const resetAll = () => {
    discardPath();
    setHubSide(null);
    setSpokes([]);
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
      store.setPreviewSpokes([]);
      store.setPreviewSpokeFocus(null);
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
        pro: isPro,
      }),
      extractLineCoords(previewRoute).length,
    );
  };

  /** Turns a side into a list. The place it has now is the first pill; the text box takes the next. */
  const startHub = (side: SpokeSide) => {
    discardPath();
    const [point, name] = side === 'start' ? [start, startName] : [end, endName];
    setSpokes([{ id: nanoid(), point, name }]);
    setHubSide(side);
  };

  /** A list down to one row is a plain route again: the row goes back into its field. */
  const collapseHub = (last: Spoke) => {
    if (hubSide === 'start') handleStartChange(last.point, last.name);
    else handleEndChange(last.point, last.name);
    setHubSide(null);
    setSpokes([]);
  };

  /** Adds a route for each spoke whose path is ready. Spokes that failed stay in the list to fix. */
  const handleCreateHub = () => {
    if (!hubSide || mode === 'walk' || readySpokes.length === 0) return;
    const inputs = readySpokes.map((spoke) => {
      const path = spokePaths[spoke.id];
      return {
        mode,
        ...spokeEndpoints(hubSide, hub, hubName, spoke),
        geojson: (path as { geojson: GeoJSON.FeatureCollection }).geojson,
      };
    });
    const items = createHubRoutes(inputs, { timing, gap, startTime: useProjectStore.getState().playheadTime, pro: isPro });
    selectItem(items[0].id);
    frame.frameGeometry({ type: 'FeatureCollection', features: items.flatMap((i) => i.geojson.features) });
    for (const item of items) reportRouteAdded(mode, extractLineCoords(item.geojson).length);

    const left = spokes.filter((s) => !readySpokes.includes(s) && (isPlacedPoint(s.point) || s.notFound));
    if (left.length === 0) {
      resetAll();
      onOpenChange(false);
      return;
    }
    toast.warning(`${HUB_SPOKE_TERMS.created(items.length)}. ${left.length} could not be routed.`);
    setPreviewSpokes([]);
    if (left.length >= 2) setSpokes(left);
    else collapseHub(left[0]);
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
  if (isHub) {
    primaryAction = (
      <Button
        variant={readySpokes.length > 0 ? 'default' : 'secondary'}
        data-walkthrough="route-action"
        onClick={handleCreateHub}
        disabled={readySpokes.length === 0 || spokesLoading}
        className="w-full"
      >
        {spokesLoading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={16} />}
        {readySpokes.length > 0 ? HUB_SPOKE_TERMS.create(readySpokes.length) : HUB_SPOKE_TERMS.createNone}
      </Button>
    );
  } else if (mode === 'walk') {
    primaryAction = (
      <Button
        variant={walkPoints.length >= 2 ? 'default' : 'secondary'}
        onClick={handleAddWalk}
        disabled={walkPoints.length < 2}
        className="w-full"
      >
        <Plus size={16} /> Insert walk path
      </Button>
    );
  } else if (!previewRoute) {
    primaryAction = (
      <Button
        variant="secondary"
        data-walkthrough="route-action"
        onClick={calculate}
        disabled={path.loading}
        className="w-full"
      >
        {path.loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Preview path
      </Button>
    );
  } else {
    primaryAction = (
      <Button
        variant="default"
        data-walkthrough="route-action"
        onClick={handleAddCarFlight}
        className="w-full"
      >
        <Plus size={16} /> Insert route
      </Button>
    );
  }

  const footer = (
    <div className="space-y-2">
      {primaryAction}
      <Button
        variant="subtle"
        size="sm"
        onClick={onImportClick}
        className="w-full"
      >
        {isGuest ? <Lock size={13} /> : <Upload size={13} />}
        {isGuest ? 'Sign in to import KML / GPX data' : 'Import KML / GPX data'}
      </Button>
    </div>
  );

  const EndpointField = mode === 'flight' ? AirportSearchField : SearchField;
  const fieldCopy = mode === 'flight' ? ENDPOINT_FIELD_COPY.flight : ENDPOINT_FIELD_COPY.car;

  /** A side of the route: its place field, with the "+" pill inside that makes it a list, or the list itself. */
  const renderSide = (side: SpokeSide) => {
    if (hubSide === side) {
      return (
        <HubSpokeList
          side={side}
          mode={mode === 'flight' ? 'flight' : 'car'}
          spokes={spokes}
          paths={spokePaths}
          isOpen={isOpen}
          onChange={(update) => setSpokes(update)}
          onCollapse={collapseHub}
        />
      );
    }
    const isStart = side === 'start';
    const label = isStart
      ? (mode === 'flight' ? PLACE_FIELD_TERMS.departure : PLACE_FIELD_TERMS.start)
      : (mode === 'flight' ? PLACE_FIELD_TERMS.arrival : PLACE_FIELD_TERMS.end);
    return (
      <LabelledField label={label}>
        <EndpointField
          {...(isStart ? fieldCopy.start : fieldCopy.end)}
          value={isStart ? start : end}
          name={isStart ? startName : endName}
          onSelect={isStart ? handleStartChange : handleEndChange}
          isPicking={isStart ? isPickingStart : isPickingEnd}
          onStartPick={isStart ? handleTogglePickStart : handleTogglePickEnd}
          onMakeList={hubSide === null ? () => startHub(side) : undefined}
        />
        {isHub && (
          <p className="mt-1 px-1 text-2xs text-muted-foreground">{HUB_SPOKE_TERMS.hubHint(isStart ? 'start' : 'end')}</p>
        )}
      </LabelledField>
    );
  };

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
        <div className="space-y-4" data-walkthrough="route-places">
          <SectionLabel>{mode === 'flight' ? 'Airport route' : 'Route points'}</SectionLabel>
          {renderSide('start')}
          {renderSide('end')}
          {isHub && placedCount >= 1 && (
            <p className="px-1 text-xs font-medium text-foreground/80">{HUB_SPOKE_TERMS.summary(placedCount)}</p>
          )}
          {isHub && placedCount >= 2 && (
            <SpokeTimingControls timing={timing} gap={gap} onTimingChange={setTiming} onGapChange={setGap} />
          )}

          {!isHub && !previewRoute && !isPlacedPoint(start) && !isPlacedPoint(end) && (
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
                  size="xs"
                  onClick={() => setPreviewRoute(null)}
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
