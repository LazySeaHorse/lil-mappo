import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { RoutePlanner } from './RoutePlanner';
import { useProjectStore } from '@/store/useProjectStore';
import { loadAirports } from '@/services/airports/airportService';
import type { RouteItem } from '@/store/types';
import { getDirections } from '@/services/directions';

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

describe('RoutePlanner in Inspector', () => {
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
      trailFade: false,
      trailFadeLength: 0.3,
      dashPattern: null,
      animationType: 'draw',
      cometTrailLength: 0.2,
    },
    calculation: {
      mode,
      startPoint: [0, 0],
      endPoint: [0, 0],
      vehicle: {
        enabled: true,
        type: 'dot',
        modelId: '',
        scale: 1,
      },
    },
    easing: 'easeInOutQuad',
  });

  beforeEach(() => {
    const route = createBaseRouteItem();
    useProjectStore.setState({
      items: { [route.id]: route },
      itemOrder: [route.id],
      selectedItemId: route.id,
      previewRoute: null,
      activePicker: null,
    });
  });

  it('renders standard location search fields when mode is car', () => {
    const route = createBaseRouteItem('car');
    render(<RoutePlanner item={route} />);

    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Search address or coordinates').length).toBe(2);
  });

  it('switches to AirportSearchField and auto-sets vehicle to plane when Flight mode is chosen', async () => {
    const route = createBaseRouteItem('car');
    render(<RoutePlanner item={route} />);

    const flightRadio = screen.getByRole('radio', { name: /flight/i });
    act(() => {
      fireEvent.click(flightRadio);
    });

    const updatedItem = useProjectStore.getState().items['route-test-1'] as RouteItem;
    expect(updatedItem.calculation?.mode).toBe('flight');
    expect(updatedItem.calculation?.vehicle?.type).toBe('plane');
  });

  it('allows picking airports and applying flight arc', async () => {
    const route = createBaseRouteItem('flight');
    route.calculation!.vehicle!.type = 'plane';
    useProjectStore.setState({ items: { [route.id]: route } });

    render(<RoutePlanner item={route} />);

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

    const applyBtn = screen.getByRole('button', { name: /Apply route/i });
    await act(async () => { fireEvent.click(applyBtn); });

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
    useProjectStore.setState({ items: { [route.id]: route }, selectedItemId: route.id });

    render(<RoutePlanner item={route} />);

    // No "Routing:" sub-toggle — walk is always freeform
    expect(screen.queryByText('Routing:')).not.toBeInTheDocument();

    // Curve controls are present
    expect(screen.getByText('Smooth Curve')).toBeInTheDocument();
    expect(screen.getByText(/Curvature/)).toBeInTheDocument();

    expect(screen.getAllByTitle('Remove point')).toHaveLength(3);
    expect(screen.getByText('-73.9780, 40.7550')).toBeInTheDocument();
  });

  it('toggling Smooth Curve switch rebuilds geometry', () => {
    const route: RouteItem = {
      ...createBaseRouteItem('car'),
      calculation: {
        mode: 'walk',
        points: [[-73.9851, 40.7488], [-73.9780, 40.7550], [-73.9650, 40.7820]],
        curved: true,
        sharpness: 0.85,
      },
    };
    useProjectStore.setState({ items: { [route.id]: route }, selectedItemId: route.id });
    render(<RoutePlanner item={route} />);

    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('data-state', 'checked');

    act(() => { fireEvent.click(switchEl); });
    const afterToggle = useProjectStore.getState().items[route.id] as RouteItem;
    expect(afterToggle.calculation).toMatchObject({ curved: false });
    const rawCoords = (afterToggle.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(rawCoords.length).toBe(3);

    act(() => { fireEvent.click(switchEl); });
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
    const storedPoints = () => {
      const calc = stored().calculation;
      return calc?.mode === 'walk' ? calc.points : undefined;
    };
    const setPoints = (points: [number, number][]) => {
      const route = walkRoute();
      if (route.calculation?.mode === 'walk') route.calculation.points = points;
      useProjectStore.setState({ items: { [route.id]: route } });
      return route;
    };
    const pick = (lngLat: [number, number]) =>
      act(() => {
        useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' });
      });

    beforeEach(() => {
      const route = walkRoute();
      useProjectStore.setState({ items: { [route.id]: route } });
    });

    it('adds a point without discarding concurrent edits', () => {
      render(<RoutePlanner item={walkRoute()} />);
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));

      // Simulate a concurrent drag of the middle point on the map
      act(() => { useProjectStore.getState().updateWalkRoute('route-test-1', { points: [[0, 0.5], [1, 2], [2, 0.5]] }); });

      pick([1.5, 0]);
      expect(storedPoints()).toEqual([[0, 0.5], [1, 2], [2, 0.5], [1.5, 0]]);
    });

    it('rebuilds geometry when a point is repositioned via map pick', () => {
      render(<RoutePlanner item={walkRoute()} />);
      // Point 1 is the start point — click its crosshair (first of three)
      const crosshairs = screen.getAllByTitle('Move point on map');
      fireEvent.click(crosshairs[0]);
      pick([-1, 0.5]);

      const coords = (stored().geojson.features[0].geometry as GeoJSON.LineString).coordinates;
      expect(coords[0]).toEqual([-1, 0.5]);
      expect(storedPoints()?.[0]).toEqual([-1, 0.5]);
    });

    it('keeps a map drag made while a move pick is pending', () => {
      render(<RoutePlanner item={walkRoute()} />);
      fireEvent.click(screen.getAllByTitle('Move point on map')[2]);
      // The middle point is dragged on the map before the pick lands
      act(() => { useProjectStore.getState().updateWalkRoute('route-test-1', (c) => ({ points: c.points.map((p, i) => (i === 1 ? [9, 9] : p)) })); });
      pick([3, 3]);
      expect(storedPoints()).toEqual([[0, 0.5], [9, 9], [3, 3]]);
    });

    it('shows a single point once and can delete it, clearing the path', () => {
      const route = setPoints([[0, 0.5], [2, 0.5]]);
      render(<RoutePlanner item={route} />);

      fireEvent.click(screen.getAllByTitle('Remove point')[1]);
      expect(screen.getAllByTitle('Remove point')).toHaveLength(1);
      expect(storedPoints()).toEqual([[0, 0.5]]);
      expect(stored().geojson.features).toEqual([]);

      fireEvent.click(screen.getByTitle('Remove point'));
      expect(screen.queryAllByTitle('Remove point')).toHaveLength(0);
      expect(storedPoints()).toEqual([]);
    });

    it('appends the first points of an empty walk without duplicating them', () => {
      const route = setPoints([]);
      render(<RoutePlanner item={route} />);
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));

      pick([5, 5]);
      expect(screen.getAllByTitle('Remove point')).toHaveLength(1);
      pick([6, 6]);
      expect(storedPoints()).toEqual([[5, 5], [6, 6]]);
      expect((stored().geojson.features[0].geometry as GeoJSON.LineString).coordinates).toEqual([[5, 5], [6, 6]]);
    });

    it('cancels a pending move pick when points are removed', () => {
      render(<RoutePlanner item={walkRoute()} />);
      fireEvent.click(screen.getAllByTitle('Move point on map')[2]);
      fireEvent.click(screen.getAllByTitle('Remove point')[0]);
      expect(useProjectStore.getState().activePicker).toBeNull();
    });

    it('stops its own pickers when unmounted', () => {
      const { unmount } = render(<RoutePlanner item={walkRoute()} />);
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));
      expect(useProjectStore.getState().activePicker?.ownerId).toBe('route-test-1');

      unmount();
      expect(useProjectStore.getState().activePicker).toBeNull();
    });

    it('stops its pickers when the route is deleted', () => {
      render(<RoutePlanner item={walkRoute()} />);
      fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));
      act(() => { useProjectStore.getState().removeItem('route-test-1'); });
      expect(useProjectStore.getState().activePicker).toBeNull();
    });
  });

  describe('switching mode', () => {
    const drivenGeometry: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[1, 1], [1.2, 1.5], [2, 2]] } }],
    };
    const stored = () => useProjectStore.getState().items['route-test-1'] as RouteItem;
    const coordsOf = (route: RouteItem) => (route.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    const setRoute = (patch: Partial<RouteItem>) => {
      const route = { ...createBaseRouteItem('car'), ...patch };
      useProjectStore.setState({ items: { [route.id]: route } });
      return route;
    };
    const clickMode = (name: RegExp) => act(() => { fireEvent.click(screen.getByRole('radio', { name })); });

    beforeEach(() => {
      vi.mocked(getDirections).mockReset();
    });

    it('car → walk redraws the path through the two endpoints', () => {
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'car', startPoint: [1, 1], endPoint: [2, 2] },
      });
      render(<RoutePlanner item={route} />);
      clickMode(/walk/i);

      expect(stored().calculation).toMatchObject({ mode: 'walk', points: [[1, 1], [2, 2]] });
      expect(coordsOf(stored())).toEqual([[1, 1], [2, 2]]);
    });

    it('walk → flight draws an arc between the first and last points', () => {
      const route = setRoute({
        geojson: drivenGeometry,
        calculation: { mode: 'walk', points: [[1, 1], [5, 5], [2, 2]], curved: true, sharpness: 0.85 },
      });
      render(<RoutePlanner item={route} />);
      clickMode(/flight/i);

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
      render(<RoutePlanner item={route} />);
      await act(async () => { fireEvent.click(screen.getByRole('radio', { name: /drive/i })); });

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
      render(<RoutePlanner item={route} />);
      clickMode(/drive/i);
      clickMode(/walk/i);
      await act(async () => {
        resolve({ geometry: { type: 'LineString', coordinates: [[9, 9], [8, 8]] }, distance: 1, duration: 1 });
      });

      expect(stored().calculation?.mode).toBe('walk');
      expect(coordsOf(stored())).toEqual([[1, 1], [2, 2]]);
    });

    it('keeps imported geometry when there are no points to redraw from', () => {
      const route = setRoute({ geojson: drivenGeometry, calculation: undefined });
      render(<RoutePlanner item={route} />);
      clickMode(/walk/i);

      expect(stored().calculation).toMatchObject({ mode: 'walk', points: [] });
      expect(stored().geojson).toEqual(drivenGeometry);
      expect(getDirections).not.toHaveBeenCalled();
    });
  });
});
