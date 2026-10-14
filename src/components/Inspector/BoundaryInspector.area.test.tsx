import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoundaryInspector } from './BoundaryInspector';
import { BOUNDARY_TERMS } from '@/lib/terms';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem } from '@/store/itemFactories';
import type { BoundaryItem } from '@/store/types';
import { readInfoTips } from '@/test/infoTips';

vi.mock('@/services/nominatim', async (importActual) => ({
  ...(await importActual<typeof import('@/services/nominatim')>()),
  searchBoundary: vi.fn(async () => [
    { display_name: 'Lyon, Metropolis of Lyon, France', geojson: { type: 'Polygon', coordinates: [[[4, 45], [5, 45], [5, 46], [4, 45]]] } },
  ]),
}));

const SEARCH = 'Search for a place or region';
const stored = () => useProjectStore.getState().items.b1 as BoundaryItem;

function setBoundary(style: Partial<BoundaryItem['style']> = {}, placeName = 'Paris') {
  const item = createBoundaryItem({
    id: 'b1',
    placeName,
    geojson: { type: 'Polygon', coordinates: [[[2, 48], [3, 48], [3, 49], [2, 48]]] },
    startTime: 0,
  });
  const withStyle = { ...item, style: { ...item.style, ...style } };
  useProjectStore.setState({ items: { b1: withStyle }, itemOrder: ['b1'], selectedItemId: 'b1' });
  return withStyle;
}

describe('area summary', () => {
  beforeEach(() => useProjectStore.setState({ items: {}, itemOrder: [] }));

  it('shows the chosen area and a Change button, with the search closed', () => {
    render(<BoundaryInspector item={setBoundary()} />);
    expect(screen.getByText(`${BOUNDARY_TERMS.area}: Paris`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BOUNDARY_TERMS.change })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(SEARCH)).toBeNull();
  });

  it('opens the area search when the user clicks Change', () => {
    render(<BoundaryInspector item={setBoundary()} />);
    fireEvent.click(screen.getByRole('button', { name: BOUNDARY_TERMS.change }));
    expect(screen.getByPlaceholderText(SEARCH)).toHaveValue('Paris');
  });

  it('changes the area when the user picks a result, then folds the search', async () => {
    render(<BoundaryInspector item={setBoundary()} />);
    fireEvent.click(screen.getByRole('button', { name: BOUNDARY_TERMS.change }));
    const input = screen.getByPlaceholderText(SEARCH);
    fireEvent.change(input, { target: { value: 'Lyon' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: /Lyon/ }));

    expect(stored().placeName).toBe('Lyon');
    await waitFor(() => expect(screen.queryByPlaceholderText(SEARCH)).toBeNull());
  });

  it('closes the search again without a change when the user clicks Cancel', () => {
    const item = setBoundary();
    render(<BoundaryInspector item={item} />);
    fireEvent.click(screen.getByRole('button', { name: BOUNDARY_TERMS.change }));
    fireEvent.click(screen.getByRole('button', { name: BOUNDARY_TERMS.cancel }));
    expect(screen.queryByPlaceholderText(SEARCH)).toBeNull();
    expect(stored()).toBe(item);
  });

  it('does not add a second heading named Area', () => {
    render(<BoundaryInspector item={setBoundary()} />);
    expect(screen.getAllByRole('heading', { name: 'Area' })).toHaveLength(1);
  });
});

describe('highlight length', () => {
  beforeEach(() => useProjectStore.setState({ items: {}, itemOrder: [] }));

  it.each([
    [0.1, '10 %'],
    [0.25, '25 %'],
    [0.5, '50 %'],
    [0.01, '1 %'],
  ])('shows a trace length of %s as %s of the outline', (traceLength, text) => {
    render(<BoundaryInspector item={setBoundary({ animateStroke: true, animationStyle: 'trace', traceLength, fillOpacity: 0.77 })} />);
    expect(screen.getByText(BOUNDARY_TERMS.highlightLength)).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('explains the slider with an (i) tip and the words Short and Long', async () => {
    render(<BoundaryInspector item={setBoundary({ animateStroke: true, animationStyle: 'trace', traceLength: 0.1 })} />);
    expect(screen.queryByText(BOUNDARY_TERMS.highlightHint)).toBeNull();
    expect(await readInfoTips()).toContain(BOUNDARY_TERMS.highlightHint);
    expect(screen.getByText('Short')).toBeInTheDocument();
    expect(screen.getByText('Long')).toBeInTheDocument();
  });
});
