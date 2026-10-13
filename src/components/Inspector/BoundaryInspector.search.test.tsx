import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryInspector } from './BoundaryInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem } from '@/store/itemFactories';

vi.mock('@/services/nominatim', async (importActual) => ({
  ...(await importActual<typeof import('@/services/nominatim')>()),
  searchBoundary: vi.fn(async () => [
    { display_name: 'Lyon, France', geojson: { type: 'Polygon', coordinates: [[[4, 45], [5, 45], [5, 46], [4, 45]]] } },
  ]),
}));

describe('BoundaryInspector search', () => {
  beforeEach(() => useProjectStore.setState({ items: {}, itemOrder: [] }));

  it('leaves the boundary untouched when a search is abandoned', async () => {
    const item = createBoundaryItem({
      id: 'b1',
      placeName: 'Paris',
      geojson: { type: 'Polygon', coordinates: [[[2, 48], [3, 48], [3, 49], [2, 48]]] },
      startTime: 0,
    });
    useProjectStore.setState({ items: { b1: item }, itemOrder: ['b1'], selectedItemId: 'b1' });
    render(<BoundaryInspector item={item} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    const input = screen.getByPlaceholderText('Search for a place or region');
    fireEvent.change(input, { target: { value: 'Lyon' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText('Search results');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByText('Search results')).not.toBeInTheDocument());

    expect(useProjectStore.getState().items.b1).toBe(item);
  });
});
