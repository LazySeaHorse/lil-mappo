import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { RouteAddDropdown } from './RouteAddDropdown';
import { useProjectStore } from '@/store/useProjectStore';
import { loadAirports } from '@/services/airports/airportService';
import { clearHistory, getHistoryEntries } from '@/store/history';
import { toast } from 'sonner';
import type { RouteItem } from '@/store/types';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));
vi.mock('@/lib/analytics/reporters', () => ({ reportRouteAdded: vi.fn() }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));

vi.mock('@/services/directions', () => ({
  getDirections: vi.fn(async (start: [number, number], end: [number, number]) => ({
    geometry: { type: 'LineString', coordinates: [start, end] },
  })),
}));
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }));

const routes = () => Object.values(useProjectStore.getState().items) as RouteItem[];

const renderPanel = () => render(<RouteAddDropdown isOpen onOpenChange={vi.fn()} onImportClick={vi.fn()} />);

/** Picks a point on the map for the n-th "pick on the map" button. */
const pick = (index: number, lngLat: [number, number], name: string) => {
  act(() => { fireEvent.click(screen.getAllByTitle(/Pick on the map/i)[index]); });
  act(() => {
    useProjectStore.getState().activePicker!.onPick({ lngLat, name });
    useProjectStore.getState().stopPicking(); // the map ends the session after a pick
  });
};

/** Hub London (the Start field) and three spokes on the End side. */
const fanOut = async () => {
  renderPanel();
  pick(0, [-0.1, 51.5], 'London');
  fireEvent.click(screen.getByRole('button', { name: /list of places: End/i }));
  pick(1, [2.3, 48.8], 'Paris');
  pick(2, [13.4, 52.5], 'Berlin');
  act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add place' })); });
  pick(3, [12.5, 41.9], 'Rome');
};

describe('RouteAddDropdown hub and spoke', () => {
  beforeAll(async () => {
    HTMLElement.prototype.scrollIntoView ??= vi.fn();
    await loadAirports();
  });

  beforeEach(() => {
    useProjectStore.setState({
      items: {}, itemOrder: [], selectedItemId: null, previewRoute: null,
      previewSpokes: [], activePicker: null, playheadTime: 3,
    });
    clearHistory();
  });

  it('turns a side into a list with a plus, and hides the plus of the other side', () => {
    renderPanel();
    expect(screen.getAllByRole('button', { name: /list of places/i })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /list of places: End/i }));
    expect(screen.getByTestId('hub-spoke-list')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /list of places/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Remove place' })).toHaveLength(2);
  });

  it('goes back to the plain planner when the list is down to one row, keeping that place', () => {
    renderPanel();
    pick(1, [2.3, 48.8], 'Paris');
    fireEvent.click(screen.getByRole('button', { name: /list of places: End/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove place' })[1]);
    expect(screen.queryByTestId('hub-spoke-list')).toBeNull();
    expect(screen.getByPlaceholderText('End location...')).toHaveValue('Paris');
    expect(screen.getAllByRole('button', { name: /list of places/i })).toHaveLength(2);
  });

  it('creates one route per spoke as one undo step, staggered from the playhead, and selects the first', async () => {
    await fanOut();
    expect(screen.getByRole('radio', { name: 'Staggered' })).toBeChecked();
    const create = await screen.findByRole('button', { name: 'Create 3 routes' });
    await waitFor(() => expect(create).toBeEnabled());
    expect(useProjectStore.getState().previewSpokes).toHaveLength(3);

    act(() => { fireEvent.click(create); });

    const added = routes();
    expect(added.map((r) => r.name)).toEqual(['London to Paris', 'London to Berlin', 'London to Rome']);
    expect(added.map((r) => r.startTime)).toEqual([3, 4, 5]);
    expect(added.every((r) => r.calculation?.mode === 'car')).toBe(true);
    expect(useProjectStore.getState().selectedItemId).toBe(added[0].id);
    expect(getHistoryEntries().past.map((e) => e.label)).toEqual(['Created 3 routes']);
    expect(useProjectStore.getState().previewSpokes).toEqual([]);
  });

  it('places the routes together or one after another when asked', async () => {
    await fanOut();
    fireEvent.click(screen.getByRole('radio', { name: 'One after another' }));
    const create = await screen.findByRole('button', { name: 'Create 3 routes' });
    await waitFor(() => expect(create).toBeEnabled());
    act(() => { fireEvent.click(create); });
    expect(routes().map((r) => r.startTime)).toEqual([3, 8, 13]);
  });

  it('converges on the hub when the start side is the list', async () => {
    renderPanel();
    pick(1, [-0.1, 51.5], 'London');
    fireEvent.click(screen.getByRole('button', { name: /list of places: Start/i }));
    pick(0, [2.3, 48.8], 'Paris');
    pick(1, [13.4, 52.5], 'Berlin');
    const create = await screen.findByRole('button', { name: 'Create 2 routes' });
    await waitFor(() => expect(create).toBeEnabled());
    act(() => { fireEvent.click(create); });
    expect(routes().map((r) => r.name)).toEqual(['Paris to London', 'Berlin to London']);
  });

  it('shows the timing controls only with two places', () => {
    renderPanel();
    pick(0, [-0.1, 51.5], 'London');
    fireEvent.click(screen.getByRole('button', { name: /list of places: End/i }));
    pick(1, [2.3, 48.8], 'Paris');
    expect(screen.queryByText('Staggered')).toBeNull();
    pick(2, [13.4, 52.5], 'Berlin');
    expect(screen.getByText('Staggered')).toBeInTheDocument();
  });

  it('marks a spoke that cannot be routed and still creates the others', async () => {
    renderPanel();
    pick(0, [-0.1, 51.5], 'London');
    fireEvent.click(screen.getByRole('button', { name: /list of places: End/i }));
    const { getDirections } = await import('@/services/directions');
    vi.mocked(getDirections).mockImplementation(async (start, end) => {
      if (end[0] === 13.4) throw new Error('NoRoute');
      return { geometry: { type: 'LineString', coordinates: [start, end] } } as never;
    });
    pick(1, [2.3, 48.8], 'Paris');
    pick(2, [13.4, 52.5], 'Berlin');

    expect(await screen.findByRole('alert')).toHaveTextContent('No route found');
    const create = await screen.findByRole('button', { name: 'Create 1 route' });
    act(() => { fireEvent.click(create); });
    expect(routes().map((r) => r.name)).toEqual(['London to Paris']);
  });

  it('splits pasted places into rows, resolving airport codes, and says when extras are dropped', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: /flight/i }));
    pick(0, [-0.1, 51.5], 'London');
    fireEvent.click(screen.getByRole('button', { name: /list of places: Arrival/i }));

    const rows = screen.getAllByPlaceholderText(/Airport or city/i);
    const text = ['JFK', 'CDG', 'nowhere-xyz-123', ...Array.from({ length: 20 }, () => 'LHR')].join('\n');
    await act(async () => {
      fireEvent.paste(rows[1], { clipboardData: { getData: () => text } });
    });

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Remove place' })).toHaveLength(20));
    expect(toast.warning).toHaveBeenCalledWith('A list holds 20 places. 4 left out.');
    expect(screen.getByText('No place found. Fix it or remove it.')).toBeInTheDocument();
  });
});
