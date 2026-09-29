import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { RoutePlanner } from './RoutePlanner';
import { useProjectStore } from '@/store/useProjectStore';
import { loadAirports } from '@/services/airports/airportService';
import type { RouteItem } from '@/store/types';

vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
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
      glowColor: '#3b82f6',
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
        startPoint: [-73.9851, 40.7488],
        endPoint: [-73.9650, 40.7820],
        waypoints: [[-73.9780, 40.7550]],
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

    // Sequential points displayed (3 points total: start + 1 waypoint + end)
    expect(screen.getByText(/Point 1:/)).toBeInTheDocument();
    expect(screen.getByText(/Point 2:/)).toBeInTheDocument();
    expect(screen.getByText(/Point 3:/)).toBeInTheDocument();
  });

  it('toggling Smooth Curve switch rebuilds geometry', () => {
    const route: RouteItem = {
      ...createBaseRouteItem('car'),
      calculation: {
        mode: 'walk',
        startPoint: [-73.9851, 40.7488],
        endPoint: [-73.9650, 40.7820],
        waypoints: [[-73.9780, 40.7550]],
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
    expect(afterToggle.calculation?.curved).toBe(false);
    const rawCoords = (afterToggle.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(rawCoords.length).toBe(3);

    act(() => { fireEvent.click(switchEl); });
    const curvedAgain = useProjectStore.getState().items[route.id] as RouteItem;
    expect(curvedAgain.calculation?.curved).toBe(true);
    const splineCoords = (curvedAgain.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(splineCoords.length).toBeGreaterThan(3);
  });

  describe('walk freeform point editing', () => {
    const walkRoute = (): RouteItem => ({
      ...createBaseRouteItem('car'),
      calculation: {
        mode: 'walk',
        startPoint: [0, 0.5],
        endPoint: [2, 0.5],
        waypoints: [[1, 1]],
        curved: false,
        sharpness: 0.85,
      },
    });

    const stored = () => useProjectStore.getState().items['route-test-1'] as RouteItem;
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

      // Simulate a concurrent drag of the existing waypoint on the map
      const dragged = {
        ...stored(),
        calculation: { ...stored().calculation!, waypoints: [[1, 2]] as [number, number][] },
      };
      act(() => { useProjectStore.setState({ items: { [dragged.id]: dragged } }); });

      pick([1.5, 0]);
      // flat list after append: [[0,0.5], [1,2], [2,0.5], [1.5,0]]
      // reassigned as: start=[0,0.5], waypoints=[[1,2],[2,0.5]], end=[1.5,0]
      expect(stored().calculation?.waypoints).toEqual([[1, 2], [2, 0.5]]);
    });

    it('rebuilds geometry when a point is repositioned via map pick', () => {
      render(<RoutePlanner item={walkRoute()} />);
      // Point 1 is the start point — click its crosshair (first of three)
      const crosshairs = screen.getAllByTitle('Move point on map');
      fireEvent.click(crosshairs[0]);
      pick([-1, 0.5]);

      const coords = (stored().geojson.features[0].geometry as GeoJSON.LineString).coordinates;
      expect(coords[0]).toEqual([-1, 0.5]);
      expect(stored().calculation?.startPoint).toEqual([-1, 0.5]);
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
});
