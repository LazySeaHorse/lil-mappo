import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { RouteAddDropdown } from './RouteAddDropdown';
import { useProjectStore } from '@/store/useProjectStore';
import { loadAirports } from '@/services/airports/airportService';
import type { RouteItem } from '@/store/types';
import { reportRouteAdded } from '@/lib/analytics/reporters';
import { MapRefContext } from '@/hooks/useMapRef';
import { useAuthStore } from '@/store/useAuthStore';
import { useWalkthroughStore } from '@/components/Onboarding/useWalkthroughStore';
import type { MapRef } from 'react-map-gl/mapbox';

vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/reporters', () => ({ reportRouteAdded: vi.fn() }));

const plan = vi.hoisted(() => ({ subscription: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: plan.subscription }),
}));

const WANDERER = { tier: 'wanderer', status: 'active' };

vi.mock('@/services/directions', () => ({
  getDirections: vi.fn().mockResolvedValue({
    geometry: {
      type: 'LineString',
      coordinates: [[0, 0], [1, 1]],
    },
  }),
}));

describe('RouteAddDropdown with Airport Picker', () => {
  beforeAll(async () => {
    if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.scrollIntoView) {
      HTMLElement.prototype.scrollIntoView = vi.fn();
    }
    await loadAirports();
  });

  beforeEach(() => {
    plan.subscription = null;
    vi.mocked(reportRouteAdded).mockClear();
    useProjectStore.setState({
      items: {},
      itemOrder: [],
      selectedItemId: null,
      previewRoute: null,
      activePicker: null,
      playheadTime: 0,
    });
  });

  it('renders standard route points by default in car mode', () => {
    render(
      <RouteAddDropdown
        isOpen={true}
        onOpenChange={vi.fn()}
        onImportClick={vi.fn()}
      />
    );

    expect(screen.getByText('Route points')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Start location...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('End location...')).toBeInTheDocument();
  });

  it('switches to Airport route pickers when Flight mode is selected', async () => {
    render(
      <RouteAddDropdown
        isOpen={true}
        onOpenChange={vi.fn()}
        onImportClick={vi.fn()}
      />
    );

    // Switch to Flight
    const flightButton = screen.getByRole('radio', { name: /flight/i });
    fireEvent.click(flightButton);

    expect(screen.getByText('Airport route')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Departure airport or city/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Arrival airport or city/i)).toBeInTheDocument();
  });

  async function insertFlightRoute(onOpenChange = vi.fn()) {
    render(
      <RouteAddDropdown
        isOpen={true}
        onOpenChange={onOpenChange}
        onImportClick={vi.fn()}
      />
    );

    // Switch to Flight mode
    fireEvent.click(screen.getByRole('radio', { name: /flight/i }));

    const startInput = screen.getByPlaceholderText(/Departure airport or city/i);
    const endInput = screen.getByPlaceholderText(/Arrival airport or city/i);

    // Type LHR into departure
    fireEvent.focus(startInput);
    fireEvent.change(startInput, { target: { value: 'LHR' } });
    const lhrOption = await screen.findByText('London Heathrow Airport');
    fireEvent.click(lhrOption);

    // Type JFK into arrival
    fireEvent.focus(endInput);
    fireEvent.change(endInput, { target: { value: 'JFK' } });
    const jfkOption = await screen.findByText(/John F Kennedy/i);
    fireEvent.click(jfkOption);

    // Click "Preview path"
    const previewBtn = screen.getByRole('button', { name: /Preview path/i });
    await act(async () => {
      fireEvent.click(previewBtn);
    });

    // Preview should now be ready, showing "Insert route"
    const insertBtn = await screen.findByRole('button', { name: /Insert route/i });
    act(() => {
      fireEvent.click(insertBtn);
    });

  }

  it('inserts a flight route with flight styling and the dot marker for a free user', async () => {
    const onOpenChange = vi.fn();
    await insertFlightRoute(onOpenChange);

    const addedRoute = Object.values(useProjectStore.getState().items)[0] as RouteItem;
    expect(addedRoute).toBeDefined();
    expect(addedRoute.kind).toBe('route');
    expect(addedRoute.calculation?.mode).toBe('flight');
    expect(addedRoute.calculation?.vehicle).toMatchObject({ enabled: true, type: 'dot' });
    expect(addedRoute.name).toContain('→');
    expect(addedRoute.calculation).toMatchObject({
      startName: 'London Heathrow Airport',
      endName: expect.stringMatching(/John F Kennedy/i),
    });
    expect(addedRoute.style.color).toBe('#f59e0b');
    expect(addedRoute.style).not.toHaveProperty('glowColor');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(reportRouteAdded).toHaveBeenCalledWith('flight', expect.any(Number));
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [addedRoute.id], selectedItemId: addedRoute.id });
  });

  it('starts a Pro user\'s flight route with the plane marker', async () => {
    plan.subscription = WANDERER;
    await insertFlightRoute();

    const addedRoute = Object.values(useProjectStore.getState().items)[0] as RouteItem;
    expect(addedRoute.calculation?.vehicle).toMatchObject({ enabled: true, type: 'plane' });
  });

  it('labels the two places in car and flight mode, with no coloured dots', () => {
    const { container } = render(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('.rounded-full.border.text-emerald-500')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: /flight/i }));
    expect(screen.getByText('Departure')).toBeInTheDocument();
    expect(screen.getByText('Arrival')).toBeInTheDocument();
  });

  it('allows map picking while in flight mode', () => {
    render(
      <RouteAddDropdown
        isOpen={true}
        onOpenChange={vi.fn()}
        onImportClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /flight/i }));

    const pickButtons = screen.getAllByTitle(/Pick on the map/i);
    expect(pickButtons.length).toBeGreaterThanOrEqual(2);

    act(() => {
      fireEvent.click(pickButtons[0]);
    });

    expect(useProjectStore.getState().activePicker?.id).toBe('route-start');
  });
  const pickPoint = (buttonIndex: number, lngLat: [number, number]) => {
    act(() => { fireEvent.click(screen.getAllByTitle(/Pick on the map/i)[buttonIndex]); });
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' }); });
  };

  it('accepts an endpoint on the prime meridian (longitude 0)', async () => {
    const { getDirections } = await import('@/services/directions');
    vi.mocked(getDirections).mockClear();
    render(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);

    pickPoint(0, [0, 51.48]);
    pickPoint(1, [2.35, 48.85]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Preview path/i })); });

    expect(getDirections).toHaveBeenCalledWith([0, 51.48], [2.35, 48.85], expect.any(AbortSignal));
    expect(await screen.findByRole('button', { name: /Insert route/i })).toBeInTheDocument();
  });

  it('re-enables Preview path after closing during a pending calculation', async () => {
    const { getDirections } = await import('@/services/directions');
    vi.mocked(getDirections).mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);

    pickPoint(0, [1, 1]);
    pickPoint(1, [2, 2]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Preview path/i })); });
    expect(screen.getByRole('button', { name: /Preview path/i })).toBeDisabled();

    rerender(<RouteAddDropdown isOpen={false} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);
    rerender(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Preview path/i })).toBeEnabled();
  });

  it('inserts a walk through the appended points without routing it', async () => {
    const { getDirections } = await import('@/services/directions');
    vi.mocked(getDirections).mockClear();
    render(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /walk/i }));
    expect(screen.getByRole('button', { name: /Insert walk path/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));
    const pick = (lngLat: [number, number]) =>
      act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' }); });
    pick([0, 0.5]);
    pick([1, 1]);
    pick([2, 0.5]);
    expect(screen.getAllByTitle('Remove point')).toHaveLength(3);

    act(() => { fireEvent.click(screen.getByRole('button', { name: /Insert walk path/i })); });

    const added = Object.values(useProjectStore.getState().items)[0] as RouteItem;
    expect(added.calculation).toMatchObject({ mode: 'walk', points: [[0, 0.5], [1, 1], [2, 0.5]], curved: true });
    expect((added.geojson.features[0].geometry as GeoJSON.LineString).coordinates.length).toBeGreaterThan(3);
    expect(getDirections).not.toHaveBeenCalled();
    expect(reportRouteAdded).toHaveBeenLastCalledWith('walk', 3);
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [added.id] });
  });
});

describe('RouteAddDropdown map framing', () => {
  const fitBounds = vi.fn();
  const map = {
    getContainer: () => ({ clientWidth: 1200, clientHeight: 800, getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
    getZoom: () => 5,
    project: () => ({ x: 600, y: 400 }),
    fitBounds,
    easeTo: vi.fn(),
  };
  const renderWithMap = () =>
    render(
      <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
        <RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />
      </MapRefContext.Provider>,
    );
  const pickPoint = (buttonIndex: number, lngLat: [number, number]) => {
    act(() => { fireEvent.click(screen.getAllByTitle(/Pick on the map/i)[buttonIndex]); });
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' }); });
  };

  beforeEach(() => {
    fitBounds.mockClear();
    useProjectStore.setState({
      items: {}, itemOrder: [], selectedItemId: null, previewRoute: null, activePicker: null,
      playheadTime: 0, isPlaying: false, isExporting: false, isScrubbing: false,
    });
  });

  it('shows the previewed path and the inserted route on the map', async () => {
    renderWithMap();
    pickPoint(0, [1, 1]);
    pickPoint(1, [2, 2]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Preview path/i })); });
    const insert = await screen.findByRole('button', { name: /Insert route/i });
    expect(fitBounds).toHaveBeenCalledTimes(1);

    act(() => { fireEvent.click(insert); });
    expect(fitBounds).toHaveBeenCalledTimes(2);
    expect(fitBounds.mock.calls[1][0]).toEqual([[0, 0], [1, 1]]);
  });

  it('shows an inserted walk path on the map', () => {
    renderWithMap();
    fireEvent.click(screen.getByRole('radio', { name: /walk/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add point on map/i }));
    const pick = (lngLat: [number, number]) =>
      act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' }); });
    pick([10, 10]);
    pick([11, 11]);
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Insert walk path/i })); });
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });

  it('keeps the camera still while the project plays', async () => {
    useProjectStore.setState({ isPlaying: true });
    renderWithMap();
    pickPoint(0, [1, 1]);
    pickPoint(1, [2, 2]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Preview path/i })); });
    expect(fitBounds).not.toHaveBeenCalled();
  });
});

describe('RouteAddDropdown file import button', () => {
  const renderDropdown = (onImportClick = vi.fn()) => {
    render(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={onImportClick} />);
    return onImportClick;
  };

  it('tells guests before they click that import needs sign-in', () => {
    useAuthStore.setState({ user: null });
    const onImportClick = renderDropdown();
    expect(screen.queryByRole('button', { name: 'Import route file' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to import a route file' }));
    expect(onImportClick).toHaveBeenCalledTimes(1);
  });

  it('shows the plain label to signed-in users', () => {
    useAuthStore.setState({ user: { id: 'u1' } as never });
    renderDropdown();
    expect(screen.getByRole('button', { name: 'Import route file' })).toBeInTheDocument();
    useAuthStore.setState({ user: null });
  });
});

describe('RouteAddDropdown quick tour', () => {
  const pickPoint = (buttonIndex: number, lngLat: [number, number]) => {
    act(() => { fireEvent.click(screen.getAllByTitle(/Pick on the map/i)[buttonIndex]); });
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: 'Point' }); });
  };

  beforeEach(() => {
    useProjectStore.setState({ items: {}, itemOrder: [], previewRoute: null, activePicker: null });
    useWalkthroughStore.getState().start(false);
  });

  afterEach(() => useWalkthroughStore.getState().dismiss());

  it('tells the tour which places are set, and when one is cleared', () => {
    render(<RouteAddDropdown isOpen={true} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);
    const endpoints = () => useWalkthroughStore.getState().walkthrough.routeEndpoints;

    pickPoint(0, [1, 1]);
    expect(endpoints()).toEqual({ start: true, end: false });
    pickPoint(1, [2, 2]);
    expect(endpoints()).toEqual({ start: true, end: true });

    fireEvent.click(screen.getAllByTitle('Clear search')[0]);
    expect(endpoints()).toEqual({ start: false, end: true });
  });

  it('does not report while the panel is closed', () => {
    render(<RouteAddDropdown isOpen={false} onOpenChange={vi.fn()} onImportClick={vi.fn()} />);
    expect(useWalkthroughStore.getState().walkthrough.routeEndpoints).toEqual({ start: false, end: false });
  });
});

