import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { RouteAddDropdown } from './RouteAddDropdown';
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

  it('selects airports and inserts a flight route with plane vehicle and flight styling', async () => {
    const onOpenChange = vi.fn();
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

    // Check store items
    const items = useProjectStore.getState().items;
    const addedRoute = Object.values(items)[0] as RouteItem;
    expect(addedRoute).toBeDefined();
    expect(addedRoute.kind).toBe('route');
    expect(addedRoute.calculation?.mode).toBe('flight');
    expect(addedRoute.calculation?.vehicle?.type).toBe('plane');
    expect(addedRoute.name).toContain('→');
    expect(addedRoute.style.color).toBe('#f59e0b');
    expect(addedRoute.style.glowColor).toBe('#fbbf24');
    expect(onOpenChange).toHaveBeenCalledWith(false);
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

    const pickButtons = screen.getAllByTitle(/Pick on Map/i);
    expect(pickButtons.length).toBeGreaterThanOrEqual(2);

    act(() => {
      fireEvent.click(pickButtons[0]);
    });

    expect(useProjectStore.getState().activePicker?.id).toBe('route-start');
  });
});
