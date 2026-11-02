import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { searchBoundaries } from '@/services/boundarySearch';
import { BoundarySearch } from './BoundarySearch';
import { SEARCH_TERMS } from '@/lib/terms';
import { prussia } from '@/test/historicalFixtures';

vi.mock('@/services/boundarySearch', () => ({
  searchBoundaries: vi.fn(async () => []),
}));

const map = {
  getCenter: () => ({ lng: -73.97, lat: 40.78 }),
  getBounds: () => ({ getWest: () => -74.1, getSouth: () => 40.7, getEast: () => -73.8, getNorth: () => 40.9 }),
};

const lyon = {
  kind: 'present' as const,
  placeName: 'Lyon',
  displayName: 'Lyon, Metropolis of Lyon, France',
  type: 'city',
  countryCode: null,
  geojson: { type: 'Polygon' as const, coordinates: [[[4, 45], [5, 45], [5, 46], [4, 45]]] },
};

async function searchFor(text: string) {
  const input = screen.getByPlaceholderText('Search for a place or region');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByText('Search results');
}

describe('BoundarySearch results', () => {
  it('shows present places as before and historical places with a date badge, in one list', async () => {
    vi.mocked(searchBoundaries).mockResolvedValueOnce([lyon, prussia]);
    const onSelect = vi.fn();
    render(<BoundarySearch initialValue="" onSelect={onSelect} />);
    await searchFor('Prussia');

    expect(screen.getByText('Lyon')).toBeInTheDocument();
    expect(screen.getByText('Metropolis of Lyon, France')).toBeInTheDocument();
    expect(screen.getByText('Kingdom of Prussia')).toBeInTheDocument();
    // The badge shows the whole span of the place: earliest start to latest end.
    expect(screen.getByRole('button', { name: 'Historical, 1701–1918' })).toHaveTextContent('1701–1918');

    fireEvent.click(screen.getByRole('button', { name: 'Kingdom of Prussia' }));
    expect(onSelect).toHaveBeenCalledWith(prussia);
  });

  it('explains the badge in a tooltip: periods, dates and the source', async () => {
    vi.mocked(searchBoundaries).mockResolvedValueOnce([prussia]);
    render(<BoundarySearch initialValue="" onSelect={vi.fn()} />);
    await searchFor('Prussia');

    const badge = screen.getByRole('button', { name: 'Historical, 1701–1918' });
    fireEvent.focus(badge);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Historical · 3 periods, 1701–1918 · Source: OpenHistoricalMap');
  });

  it('shows an open-ended span as present, and tapping the badge does not choose the place', async () => {
    const open = { ...prussia, versions: [{ osmId: 'R9', startDate: '1958', endDate: null, notes: [] }] };
    vi.mocked(searchBoundaries).mockResolvedValueOnce([open]);
    const onSelect = vi.fn();
    render(<BoundarySearch initialValue="" onSelect={onSelect} />);
    await searchFor('Prussia');

    const badge = screen.getByRole('button', { name: 'Historical, 1958–present' });
    fireEvent.click(badge);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('BoundarySearch', () => {
  it('leans towards the visible map', async () => {
    const ref = { current: { getMap: () => map } as unknown as MapRef };
    render(
      <MapRefContext.Provider value={ref}>
        <BoundarySearch initialValue="" onSelect={vi.fn()} />
      </MapRefContext.Provider>,
    );
    const input = screen.getByPlaceholderText('Search for a place or region');
    fireEvent.change(input, { target: { value: 'Central Park' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(searchBoundaries).toHaveBeenCalled());
    expect(searchBoundaries).toHaveBeenCalledWith('Central Park', expect.any(AbortSignal), [-74.1, 40.7, -73.8, 40.9]);
  });

  it('shows a magnifying glass when empty and an X that clears the box when filled', () => {
    const { container } = render(<BoundarySearch initialValue="" onSelect={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search for a place or region');
    expect(container.querySelector('svg.lucide-search')).not.toBeNull();
    expect(screen.queryByRole('button', { name: SEARCH_TERMS.clear })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Lyon' } });
    expect(container.querySelector('svg.lucide-search')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: SEARCH_TERMS.clear }));
    expect(input).toHaveValue('');
    expect(container.querySelector('svg.lucide-search')).not.toBeNull();
  });

  it('has a visible border', () => {
    render(<BoundarySearch initialValue="" onSelect={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search for a place or region').className).toContain('border-foreground/25');
  });
});
