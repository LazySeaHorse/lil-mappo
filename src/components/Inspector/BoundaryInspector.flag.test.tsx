import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { BoundaryInspector } from './BoundaryInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { DEFAULT_BOUNDARY_STYLE } from '@/store/itemFactories';
import type { BoundaryItem } from '@/store/types';

vi.mock('./BoundarySearch', () => ({ BoundarySearch: () => <div data-testid="boundary-search-mock" /> }));
vi.mock('@/components/MapViewport/runtime/flagImages', async (importActual) => ({
  ...(await importActual<typeof import('@/components/MapViewport/runtime/flagImages')>()),
  loadFlagSvg: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"/>'),
}));

function boundary(style: Partial<BoundaryItem['style']> = {}): BoundaryItem {
  return {
    id: 'b1',
    kind: 'boundary',
    placeName: 'France',
    geojson: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
    startTime: 0,
    endTime: 4,
    easing: 'linear',
    resolveStatus: 'resolved',
    style: { ...DEFAULT_BOUNDARY_STYLE, ...style },
  };
}

const styleOf = () => (useProjectStore.getState().items.b1 as BoundaryItem).style;

function mount(item: BoundaryItem) {
  useProjectStore.setState({ items: { b1: item }, itemOrder: ['b1'], selectedItemId: 'b1' });
  const view = render(<BoundaryInspector item={item} />);
  const rerender = () => view.rerender(<BoundaryInspector item={useProjectStore.getState().items.b1 as BoundaryItem} />);
  return { rerender };
}

describe('BoundaryInspector flag fill', () => {
  beforeAll(() => {
    // cmdk and Radix popovers rely on these in jsdom
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView ??= () => {};
  });
  beforeEach(() => useProjectStore.setState({ items: {}, itemOrder: [] }));

  it('shows the Color / Flag toggle with Color selected and the fill colour picker', () => {
    mount(boundary());
    expect(screen.getByRole('radio', { name: 'Color' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Flag' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Fill color')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Country flag' })).not.toBeInTheDocument();
  });

  it('switches to flag mode, hides the fill colour and keeps fill opacity', () => {
    const { rerender } = mount(boundary({ flagCode: 'fr' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Flag' }));
    expect(styleOf().fillMode).toBe('flag');
    rerender();
    expect(screen.queryByText('Fill color')).not.toBeInTheDocument();
    expect(screen.getByText('Fill opacity')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Country flag' })).toHaveTextContent('France');
  });

  it('prompts for a country when no flag is chosen', () => {
    mount(boundary({ fillMode: 'flag', flagCode: null }));
    expect(screen.getByRole('combobox', { name: 'Country flag' })).toHaveTextContent('Choose a country flag');
    expect(screen.getByText('Choose a country to fill this boundary with its flag.')).toBeInTheDocument();
  });

  it('picks a country from the searchable list', async () => {
    mount(boundary({ fillMode: 'flag', flagCode: 'fr' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Country flag' }));
    fireEvent.change(screen.getByPlaceholderText('Search countries'), { target: { value: 'germ' } });
    fireEvent.click(await screen.findByText('Germany'));
    expect(styleOf().flagCode).toBe('de');
    await waitFor(() => expect(screen.queryByPlaceholderText('Search countries')).not.toBeInTheDocument());
  });

  it('switches back to colour mode', () => {
    const { rerender } = mount(boundary({ fillMode: 'flag', flagCode: 'fr' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Color' }));
    rerender();
    expect(styleOf()).toMatchObject({ fillMode: 'color', flagCode: 'fr' });
    expect(screen.getByText('Fill color')).toBeInTheDocument();
  });
});
