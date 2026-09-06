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

describe('RoutePlanner in Inspector with Flight mode', () => {
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

    // Switch to Flight mode
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
    // Pre-populate with plane
    route.calculation!.vehicle!.type = 'plane';
    useProjectStore.setState({
      items: { [route.id]: route },
    });

    render(<RoutePlanner item={route} />);

    // Departure and Arrival airport fields
    const departureInput = screen.getByPlaceholderText(/Departure airport or city/i);
    const arrivalInput = screen.getByPlaceholderText(/Arrival airport or city/i);

    expect(departureInput).toBeInTheDocument();
    expect(arrivalInput).toBeInTheDocument();

    // Select LHR
    fireEvent.focus(departureInput);
    fireEvent.change(departureInput, { target: { value: 'LHR' } });
    const lhrOption = await screen.findByText('London Heathrow Airport');
    act(() => {
      fireEvent.click(lhrOption);
    });

    // Select JFK
    fireEvent.focus(arrivalInput);
    fireEvent.change(arrivalInput, { target: { value: 'JFK' } });
    const jfkOption = await screen.findByText(/John F Kennedy/i);
    act(() => {
      fireEvent.click(jfkOption);
    });

    // Apply route
    const applyBtn = screen.getByRole('button', { name: /Apply route/i });
    await act(async () => {
      fireEvent.click(applyBtn);
    });

    const finalItem = useProjectStore.getState().items['route-test-1'] as RouteItem;
    expect(finalItem.geojson.features.length).toBe(1);
    expect(finalItem.geojson.features[0].geometry.type).toBe('LineString');
    // Turf great circle has 100 coordinates with 3D altitude
    const coords = (finalItem.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBeGreaterThan(10);
    expect(coords[0].length).toBe(3); // [lng, lat, altitude]
  });
});
