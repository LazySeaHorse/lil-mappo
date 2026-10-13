import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { RoutePathSection } from './RoutePathSection';
import { useProjectStore } from '@/store/useProjectStore';
import { loadAirports } from '@/services/airports/airportService';
import type { EndpointRouteCalculation, RouteItem } from '@/store/types';
import { getDirections } from '@/services/directions';
import { MapRefContext } from '@/hooks/useMapRef';
import type { MapRef } from 'react-map-gl/mapbox';

const { suggest, retrieve } = vi.hoisted(() => ({ suggest: vi.fn(), retrieve: vi.fn() }));

vi.mock('@mapbox/search-js-core', () => ({
  SearchBoxCore: class {},
  SearchSession: class {
    suggest = suggest;
    retrieve = retrieve;
  },
}));

vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/services/directions', () => ({
  getDirections: vi.fn(),
}));

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    data: { tier: 'cartographer' },
  }),
}));

/** Renders the route like the inspector does: the item comes from the store. */
const LiveRoute = ({ id }: { id: string }) => {
  const item = useProjectStore((s) => s.items[id]) as RouteItem | undefined;
  if (!item) return null;
  return <RoutePathSection key={item.id} item={item} />;
};

const draftCalc = () => useProjectStore.getState().routeDraft!.calculation;
const draftEndpoints = () => draftCalc() as EndpointRouteCalculation;

describe('RoutePlanner in Inspector (edits a draft)', () => {
  beforeAll(async () => {
    if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    await loadAirports();
  });

  const createBaseRouteItem = (mode: 'car' | 'flight' = 'car'): RouteItem => ({
    id: 'route-test-1',
    kind: 'route',
    name: 'Test Route',
    startTime: 0,
    endTime: 10,
    geojson: {
      type: 'FeatureCollection',
      features: [],
    },
    style: {
      color: '#3b82f6',
      width: 4,
      glow: true,
      glowWidth: 12,
      dashPattern: null,
      animationType: 'draw',
      cometTrailLength: 0.2,
    },
    calculation: {
      mode,
      startPoint: [0, 0],
      endPoint: [0, 0],
      startName: '',
      endName: '',
      vehicle: {
        enabled: true,
        type: 'dot',
        modelId: '',
        scale: 1,
      },
    },
    easing: 'easeInOutQuad', exitAnimation: 'none',
  });

  beforeEach(() => {
    const route = createBaseRouteItem();
    useProjectStore.setState({
      items: { [route.id]: route },
      itemOrder: [route.id],
      selectedItemId: route.id,
      previewRoute: null,
      activePicker: null,
      routeDraft: null,
    });
  });

  /** Puts the route in the store, renders its path section and opens the editor. */
  const openEditor = (route: RouteItem, wrap: (node: React.ReactNode) => React.ReactNode = (node) => node) => {
    useProjectStore.setState({ items: { [route.id]: route }, itemOrder: [route.id], selectedItemId: route.id });
    const view = render(<>{wrap(<LiveRoute id={route.id} />)}</>);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    return view;
  };
  const applyDraft = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });

  it('renders standard location search fields when mode is car', () => {
    openEditor(createBaseRouteItem('car'));

    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Search address or coordinates').length).toBe(2);
  });

  it('switches to flight mode without changing the route marker', async () => {
    openEditor(createBaseRouteItem('car'));

    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /flight/i }));
    });

    expect(draftCalc().mode).toBe('flight');
    expect(draftCalc().vehicle).toEqual({ enabled: true, type: 'dot', modelId: '', scale: 1 });
  });

  it('keeps a disabled route marker disabled when Flight mode is chosen', () => {
    const route = createBaseRouteItem('car');
    route.calculation!.vehicle!.enabled = false;
    openEditor(route);

    act(() => {
      fireEvent.click(screen.getByRole('radio', { name: /flight/i }));
    });

    expect(draftCalc().vehicle?.enabled).toBe(false);
  });

  describe('endpoint map pickers', () => {
    const pick = (lngLat: [number, number]) =>
      act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: '' }); });

    it('car: picks start and end on the map and toggles a picker off', () => {
      openEditor(createBaseRouteItem('car'));
      const [startBtn, endBtn] = screen.getAllByTitle('Pick on Map');

      fireEvent.click(startBtn);
      expect(useProjectStore.getState().activePicker).toMatchObject({ id: 'route-route-test-1-start', ownerId: 'route-test-1', prompt: 'Start' });
      pick([0, 51.48]);
      expect(draftCalc()).toMatchObject({ startPoint: [0, 51.48], endPoint: [0, 0] });

      fireEvent.click(endBtn);
      expect(useProjectStore.getState().activePicker).toMatchObject({ id: 'route-route-test-1-end', prompt: 'End' });
      // The field being picked is blank; the other one shows its point.
      expect(screen.getByPlaceholderText('Search address or coordinates')).toHaveValue('0.00000, 51.48000');
      fireEvent.click(screen.getAllByTitle('Pick on Map')[1]);
      expect(useProjectStore.getState().activePicker).toBeNull();
    });

    it('flight: picks the departure on the map', () => {
      const route = createBaseRouteItem('flight');
      openEditor(route);

      fireEvent.click(screen.getAllByTitle(/Pick on Map/i)[0]);
      expect(useProjectStore.getState().activePicker).toMatchObject({ id: 'route-route-test-1-start', ownerId: 'route-test-1', prompt: 'Start' });
      pick([2, 3]);
      expect(draftCalc()).toMatchObject({ mode: 'flight', startPoint: [2, 3] });
    });
  });

  it('allows picking airports and applying flight arc', async () => {
    const route = createBaseRouteItem('flight');
    route.calculation!.vehicle!.type = 'plane';
    openEditor(route);

    const departureInput = screen.getByPlaceholderText(/Departure airport or city/i);
    const arrivalInput = screen.getByPlaceholderText(/Arrival airport or city/i);

    expect(departureInput).toBeInTheDocument();
    expect(arrivalInput).toBeInTheDocument();

    fireEvent.focus(departureInput);
    fireEvent.change(departureInput, { target: { value: 'LHR' } });
    const lhrOption = await screen.findByText('London Heathrow Airport');
    act(() => { fireEvent.click(lhrOption); });

    fireEvent.focus(arrivalInput);
    fireEvent.change(arrivalInput, { target: { value: 'JFK' } });
    const jfkOption = await screen.findByText(/John F Kennedy/i);
    act(() => { fireEvent.click(jfkOption); });

    await applyDraft();

    const finalItem = useProjectStore.getState().items['route-test-1'] as RouteItem;
    expect(finalItem.geojson.features.length).toBe(1);
    expect(finalItem.geojson.features[0].geometry.type).toBe('LineString');
    const coords = (finalItem.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBeGreaterThan(10);
    expect(coords[0].length).toBe(2);
  });

  it('shows walk freeform UI (no routing sub-toggle, always freeform)', () => {
    const route: RouteItem = {
      ...createBaseRouteItem('car'),
      calculation: {
        mode: 'walk',
        points: [[-73.9851, 40.7488], [-73.9780, 40.7550], [-73.9650, 40.7820]],
        curved: true,
        sharpness: 0.85,
      },
    };
    openEditor(route);

    // No "Routing:" sub-toggle — walk is always freeform
    expect(screen.queryByText('Routing:')).not.toBeInTheDocument();

    // Curve controls are present
    expect(screen.getByText('Smooth Curve')).toBeInTheDocument();
    expect(screen.getByText(/Curvature/)).toBeInTheDocument();

    expect(screen.getAllByTitle('Remove point')).toHaveLength(3);
    expect(screen.getByText('-73.9780, 40.7550')).toBeInTheDocument();
  });

  it('toggling Smooth Curve switch rebuilds geometry when applied', async () => {
    const route: RouteItem = {
      ...createBaseRouteItem('car'),
      calculation: {
        mode: 'walk',
        points: [[-73.9851, 40.7488], [-73.9780, 40.7550], [-73.9650, 40.7820]],
        curved: true,
        sharpness: 0.85,
      },
    };
    openEditor(route);

    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('data-state', 'checked');

    act(() => { fireEvent.click(switchEl); });
    expect(draftCalc()).toMatchObject({ curved: false });
    await applyDraft();
    const afterToggle = useProjectStore.getState().items[route.id] as RouteItem;
    expect(afterToggle.calculation).toMatchObject({ curved: false });
    const rawCoords = (afterToggle.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(rawCoords.length).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    act(() => { fireEvent.click(screen.getByRole('switch')); });
    await applyDraft();
    const curvedAgain = useProjectStore.getState().items[route.id] as RouteItem;
    expect(curvedAgain.calculation).toMatchObject({ curved: true });
    const splineCoords = (curvedAgain.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(splineCoords.length).toBeGreaterThan(3);
  });

  describe('walk freeform point editing', () => {
    const walkRoute = (): RouteItem => ({
      ...createBaseRouteItem('car'),
      calculation: {
        mode: 'walk',
        points: [[0, 0.5], [1, 1], [2, 0.5]],
        curved: false,
        sharpness: 0.85,
      },
    });

    const stored = () => useProjectStore.getState().items['route-test-1'] as RouteItem;
    const draftPoints = () => {
      const calc = useProjectStore.getState().routeDraft?.calculation;
      return calc?.mode === 'walk' ? calc.points : undefined;
    };
    const dragDraftPoint = (index: number, point: [number, number]) =>
      act(() => {
        useProjectStore.getState().updateRouteDraft((c) =>
          c.mode === 'walk' ? { ...c, points: c.points.map((p, i) => (i === index ? point : p)) } : c);
      });
    const setPoints = (points: [number, number][]) => {
      const route = walkRoute();
      if (route.calculation?.mode === 'walk') route.calculation.points = points;
      return route;
    };
    const pick = (lngLat: [number, number]) =>
      act(() => {
        useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' });
      });


    it('adds a point without discarding concurrent edits', () => {
      openEditor(walkRoute());
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));

      // Simulate a concurrent drag of the middle point on the map
      dragDraftPoint(1, [1, 2]);

      pick([1.5, 0]);
      expect(draftPoints()).toEqual([[0, 0.5], [1, 2], [2, 0.5], [1.5, 0]]);
      expect(stored().calculation).toMatchObject({ points: [[0, 0.5], [1, 1], [2, 0.5]] });
    });

    it('moves a point via map pick and rebuilds the geometry when applied', async () => {
      openEditor(walkRoute());
      // Point 1 is the start point — click its crosshair (first of three)
      const crosshairs = screen.getAllByTitle('Move point on map');
      fireEvent.click(crosshairs[0]);
      pick([-1, 0.5]);
      expect(draftPoints()?.[0]).toEqual([-1, 0.5]);

      await applyDraft();
      const coords = (stored().geojson.features[0].geometry as GeoJSON.LineString).coordinates;
      expect(coords[0]).toEqual([-1, 0.5]);
      expect((stored().calculation as { points: unknown[] }).points[0]).toEqual([-1, 0.5]);
    });

    it('keeps a map drag made while a move pick is pending', () => {
      openEditor(walkRoute());
      fireEvent.click(screen.getAllByTitle('Move point on map')[2]);
      // The middle point is dragged on the map before the pick lands
      dragDraftPoint(1, [9, 9]);
      pick([3, 3]);
      expect(draftPoints()).toEqual([[0, 0.5], [9, 9], [3, 3]]);
    });

    it('shows a single point once and can delete it, clearing the path when applied', async () => {
      const route = setPoints([[0, 0.5], [2, 0.5]]);
      openEditor(route);

      fireEvent.click(screen.getAllByTitle('Remove point')[1]);
      expect(screen.getAllByTitle('Remove point')).toHaveLength(1);
      expect(draftPoints()).toEqual([[0, 0.5]]);
      await applyDraft();
      expect(stored().geojson.features).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.click(screen.getByTitle('Remove point'));
      expect(screen.queryAllByTitle('Remove point')).toHaveLength(0);
      expect(draftPoints()).toEqual([]);
    });

    it('appends the first points of an empty walk without duplicating them', async () => {
      const route = setPoints([]);
      openEditor(route);
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));

      pick([5, 5]);
      expect(screen.getAllByTitle('Remove point')).toHaveLength(1);
      pick([6, 6]);
      expect(draftPoints()).toEqual([[5, 5], [6, 6]]);
      await applyDraft();
      expect((stored().geojson.features[0].geometry as GeoJSON.LineString).coordinates).toEqual([[5, 5], [6, 6]]);
    });

    it('cancels a pending move pick when points are removed', () => {
      openEditor(walkRoute());
      fireEvent.click(screen.getAllByTitle('Move point on map')[2]);
      fireEvent.click(screen.getAllByTitle('Remove point')[0]);
      expect(useProjectStore.getState().activePicker).toBeNull();
    });

    it('stops its own pickers when unmounted', () => {
      const { unmount } = openEditor(walkRoute());
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));
      expect(useProjectStore.getState().activePicker?.ownerId).toBe('route-test-1');

      unmount();
      expect(useProjectStore.getState().activePicker).toBeNull();
    });

    it('stops its pickers when the route is deleted', () => {
      openEditor(walkRoute());
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));
      act(() => { useProjectStore.getState().removeItem('route-test-1'); });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });

  describe('place names', () => {
    const SEARCH = 'Search address or coordinates';
    const calcOf = draftEndpoints;
    const setCalc = (patch: Partial<EndpointRouteCalculation>) => {
      const route = createBaseRouteItem('car');
      route.calculation = { mode: 'car', startPoint: [-73.99785, 40.71234], endPoint: [-73.96542, 40.78243], startName: '', endName: '', ...patch };
      return route;
    };

    beforeEach(() => {
      suggest.mockReset();
      retrieve.mockReset();
    });

    it('shows the saved names in the Start and End fields', () => {
      openEditor(setCalc({ startName: 'Times Square', endName: 'Central Park' }));
      const [start, end] = screen.getAllByPlaceholderText(SEARCH);
      expect(start).toHaveValue('Times Square');
      expect(end).toHaveValue('Central Park');
    });

    it('shows formatted coordinates when no name is known', () => {
      openEditor(setCalc({ startName: 'Times Square' }));
      const [start, end] = screen.getAllByPlaceholderText(SEARCH);
      expect(start).toHaveValue('Times Square');
      expect(end).toHaveValue('-73.96542, 40.78243');
    });

    it('keeps the name of a place picked from the search results in the draft only', async () => {
      suggest.mockResolvedValue({ suggestions: [{ mapbox_id: 'a', name: 'Brooklyn Bridge' }] });
      retrieve.mockResolvedValue({ features: [{ geometry: { coordinates: [-73.9969, 40.7061] }, properties: { name: 'Brooklyn Bridge' } }] });
      openEditor(setCalc({}));

      const start = screen.getAllByPlaceholderText(SEARCH)[0];
      fireEvent.change(start, { target: { value: 'Brooklyn Bridge' } });
      fireEvent.keyDown(start, { key: 'Enter' });
      fireEvent.click(await screen.findByText('Brooklyn Bridge', { selector: 'span' }));

      await waitFor(() => expect(calcOf().startName).toBe('Brooklyn Bridge'));
      expect(calcOf().startPoint).toEqual([-73.9969, 40.7061]);
      expect(calcOf().endName).toBe('');
      expect((useProjectStore.getState().items['route-test-1'] as RouteItem).calculation).toMatchObject({ startName: '' });
    });

    it('searches with the search button too', async () => {
      suggest.mockResolvedValue({ suggestions: [] });
      openEditor(setCalc({}));
      const start = screen.getAllByPlaceholderText(SEARCH)[0];
      fireEvent.change(start, { target: { value: 'Brooklyn Bridge' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]);
      await waitFor(() => expect(suggest).toHaveBeenCalledTimes(1));
      expect(suggest.mock.calls[0][0]).toBe('Brooklyn Bridge');
    });

    it('searches only on Enter, not while typing', () => {
      openEditor(setCalc({}));
      fireEvent.change(screen.getAllByPlaceholderText(SEARCH)[0], { target: { value: 'Brooklyn Bridge' } });
      expect(suggest).not.toHaveBeenCalled();
    });

    it('clears the name when coordinates are typed', async () => {
      openEditor(setCalc({ startName: 'Times Square' }));
      const start = screen.getAllByPlaceholderText(SEARCH)[0];
      fireEvent.change(start, { target: { value: '-74.0, 40.7' } });
      fireEvent.keyDown(start, { key: 'Enter' });

      await waitFor(() => expect(calcOf().startPoint).toEqual([-74, 40.7]));
      expect(calcOf().startName).toBe('');
    });

    it('stores the name of a place picked on the map, or none when the pick has no name', () => {
      openEditor(setCalc({ endName: 'Central Park' }));
      act(() => { fireEvent.click(screen.getAllByTitle('Pick on Map')[1]); });
      act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [2, 3], name: 'Pier 17' }); });
      expect(calcOf()).toMatchObject({ endPoint: [2, 3], endName: 'Pier 17' });

      act(() => { useProjectStore.getState().stopPicking(); });
      act(() => { fireEvent.click(screen.getAllByTitle('Pick on Map')[1]); });
      act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [4, 5], name: '' }); });
      expect(calcOf()).toMatchObject({ endPoint: [4, 5], endName: '' });
    });

    it('shows and stores airport names in Flight mode', async () => {
      const route = createBaseRouteItem('flight');
      route.calculation = { mode: 'flight', startPoint: [1, 1], endPoint: [2, 2], startName: 'London Heathrow Airport', endName: '' };
      openEditor(route);
      expect(screen.getByPlaceholderText(/Departure airport or city/i)).toHaveValue('London Heathrow Airport');

      const arrival = screen.getByPlaceholderText(/Arrival airport or city/i);
      fireEvent.focus(arrival);
      fireEvent.change(arrival, { target: { value: 'JFK' } });
      act(() => { fireEvent.click(screen.getByText(/John F Kennedy/i)); });
      expect(calcOf().endName).toMatch(/John F Kennedy/i);
    });
  });

  describe('map framing', () => {
    const fitBounds = vi.fn();
    const map = {
      getContainer: () => ({ getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
      getZoom: () => 5,
      project: () => ({ x: 600, y: 400 }),
      fitBounds,
      easeTo: vi.fn(),
    };
    const renderRoute = () => {
      const route = createBaseRouteItem('car');
      route.calculation = { mode: 'car', startPoint: [1, 1], endPoint: [3, 4], startName: '', endName: '' };
      useProjectStore.setState({ isPlaying: false, isScrubbing: false, isExporting: false });
      openEditor(route, (node) => (
        <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
          {node}
        </MapRefContext.Provider>
      ));
      // A change makes Apply show.
      act(() => { useProjectStore.getState().updateRouteDraft((c) => (c.mode === 'walk' ? c : { ...c, endPoint: [3, 4.5] })); });
    };

    beforeEach(() => {
      fitBounds.mockClear();
      vi.mocked(getDirections).mockReset().mockResolvedValue({
        geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2], [3, 4]] }, distance: 1, duration: 1,
      });
    });

    it('shows the applied route on the map', async () => {
      renderRoute();
      await applyDraft();
      expect(fitBounds).toHaveBeenCalledTimes(1);
      expect(fitBounds.mock.calls[0][0]).toEqual([[1, 1], [3, 4]]);
    });

    it('shows the previewed route on the map', async () => {
      renderRoute();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Preview route/i })); });
      expect(fitBounds).toHaveBeenCalledTimes(1);
      expect(useProjectStore.getState().previewRoute).not.toBeNull();
    });
  });

  describe('switching mode', () => {
    const drivenGeometry: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[1, 1], [1.2, 1.5], [2, 2]] } }],
    };
    const stored = () => useProjectStore.getState().items['route-test-1'] as RouteItem;
    const coordsOf = (route: RouteItem) => (route.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    const setRoute = (patch: Partial<RouteItem>) => ({ ...createBaseRouteItem('car'), ...patch });
    const clickMode = (name: RegExp) => act(() => { fireEvent.click(screen.getByRole('radio', { name })); });

    beforeEach(() => {
      vi.mocked(getDirections).mockReset();
    });

    it('keeps the route as saved until the switch is applied', () => {
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'car', startPoint: [1, 1], endPoint: [2, 2], startName: '', endName: '' },
      });
      openEditor(route);
      clickMode(/walk/i);

      expect(draftCalc()).toMatchObject({ mode: 'walk', points: [[1, 1], [2, 2]] });
      expect(stored().calculation).toMatchObject({ mode: 'car' });
      expect(stored().geojson).toEqual(drivenGeometry);
    });

    it('car → walk redraws the path through the two endpoints', async () => {
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'car', startPoint: [1, 1], endPoint: [2, 2], startName: '', endName: '' },
      });
      openEditor(route);
      clickMode(/walk/i);
      await applyDraft();

      expect(stored().calculation).toMatchObject({ mode: 'walk', points: [[1, 1], [2, 2]] });
      expect(coordsOf(stored())).toEqual([[1, 1], [2, 2]]);
    });

    it('walk → flight draws an arc between the first and last points', async () => {
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'walk', points: [[1, 1], [5, 5], [2, 2]], curved: true, sharpness: 0.85 },
      });
      openEditor(route);
      clickMode(/flight/i);
      await applyDraft();

      expect(stored().calculation).toMatchObject({ mode: 'flight', startPoint: [1, 1], endPoint: [2, 2] });
      const coords = coordsOf(stored());
      expect(coords[0]).toEqual([1, 1]);
      expect(coords[coords.length - 1]).toEqual([2, 2]);
      expect(coords).not.toContainEqual([5, 5]);
    });

    it('walk → car fetches directions between the first and last points', async () => {
      vi.mocked(getDirections).mockResolvedValue({
        geometry: { type: 'LineString', coordinates: [[1, 1], [1.5, 1.1], [2, 2]] }, distance: 1, duration: 1,
      });
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'walk', points: [[1, 1], [5, 5], [2, 2]], curved: true, sharpness: 0.85 },
      });
      openEditor(route);
      await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /car/i })); });
      expect(getDirections).not.toHaveBeenCalled();
      await applyDraft();

      expect(getDirections).toHaveBeenCalledWith([1, 1], [2, 2], expect.any(AbortSignal));
      expect(coordsOf(stored())).toEqual([[1, 1], [1.5, 1.1], [2, 2]]);
    });

    it('discards a directions result that lands after switching away from car', async () => {
      let resolve!: (value: Awaited<ReturnType<typeof getDirections>>) => void;
      vi.mocked(getDirections).mockReturnValue(new Promise((r) => { resolve = r; }));
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'walk', points: [[1, 1], [2, 2]], curved: true, sharpness: 0.85 },
      });
      openEditor(route);
      clickMode(/car/i);
      await applyDraft();
      expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
      clickMode(/walk/i);
      await act(async () => {
        resolve({ geometry: { type: 'LineString', coordinates: [[9, 9], [8, 8]] }, distance: 1, duration: 1 });
      });

      expect(draftCalc().mode).toBe('walk');
      expect(stored().calculation?.mode).toBe('walk');
      expect(coordsOf(stored())).toEqual(coordsOf({ geojson: drivenGeometry } as RouteItem));
    });

    it('keeps imported geometry when there are no points to redraw from', async () => {
      const route = setRoute({ geojson: drivenGeometry, calculation: undefined });
      openEditor(route);
      clickMode(/walk/i);
      await applyDraft();

      expect(stored().calculation).toMatchObject({ mode: 'walk', points: [] });
      expect(stored().geojson).toEqual(drivenGeometry);
      expect(getDirections).not.toHaveBeenCalled();
    });
  });
});
