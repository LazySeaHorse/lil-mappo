import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoundaryInspector } from './BoundaryInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem } from '@/store/itemFactories';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { sourceForVersion } from '@/engine/historicalSource';
import { BOUNDARY_TERMS } from '@/lib/terms';
import { searchBoundaries } from '@/services/boundarySearch';
import { fetchHistoricalOutline } from '@/services/openHistoricalMap';
import { prussia } from '@/test/historicalFixtures';
import { syntheticIsland } from '@/test/syntheticGeometry';
import type { BoundaryItem } from '@/store/types';

vi.mock('@/services/boundarySearch', () => ({ searchBoundaries: vi.fn() }));
vi.mock('@/services/openHistoricalMap', () => ({ fetchHistoricalOutline: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SEARCH = 'Search for a place or region';
const island = syntheticIsland();
const isola = { kind: 'present' as const, placeName: 'Isola', displayName: 'Isola, Italia', type: 'island', countryCode: null, geojson: island };

const stored = () => useProjectStore.getState().items.b1 as BoundaryItem;
const detailRadio = (name: RegExp) => screen.getByRole('radio', { name });

function setBoundary() {
  const item = createBoundaryItem({ id: 'b1', placeName: 'Paris', geojson: applyBoundaryDetail(syntheticIsland(500)), startTime: 0 });
  useProjectStore.setState({ items: { b1: item }, itemOrder: ['b1'], selectedItemId: 'b1' });
  return item;
}

async function pickResult(name: string, result: unknown) {
  vi.mocked(searchBoundaries).mockResolvedValueOnce([result as Awaited<ReturnType<typeof searchBoundaries>>[number]]);
  const input = screen.getByPlaceholderText(SEARCH);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
  const row = await screen.findByRole('button', { name: new RegExp(`^${name}`) });
  await act(async () => { fireEvent.click(row); });
}

describe('BoundaryInspector detail', () => {
  beforeEach(() => {
    vi.mocked(fetchHistoricalOutline).mockReset();
    vi.mocked(fetchHistoricalOutline).mockImplementation(async () => ({ geojson: island, countryCode: null }));
    useProjectStore.setState({ items: {}, itemOrder: [] });
    useProjectStore.getState().setBoundaryDetail('light');
    clearHistory();
  });

  it('has no Detail field before the area is changed', () => {
    render(<BoundaryInspector item={setBoundary()} />);
    expect(screen.queryByText(BOUNDARY_TERMS.detail)).not.toBeInTheDocument();
  });

  it('stores a new area at the detail chosen last and then offers Detail', async () => {
    useProjectStore.getState().setBoundaryDetail('detailed');
    const { rerender } = render(<BoundaryInspector item={setBoundary()} />);
    await pickResult('Isola', isola);

    expect(stored().geojson).toBe(applyBoundaryDetail(island, 'detailed'));
    rerender(<BoundaryInspector item={stored()} />);
    expect(detailRadio(/detailed/i)).toHaveAttribute('aria-checked', 'true');
  });

  it('changes the detail of the new area in one undo step and remembers the level', async () => {
    const { rerender } = render(<BoundaryInspector item={setBoundary()} />);
    await pickResult('Isola', isola);
    rerender(<BoundaryInspector item={stored()} />);
    clearHistory();

    fireEvent.click(detailRadio(/standard/i));
    expect(stored().geojson).toBe(applyBoundaryDetail(island, 'standard'));
    expect(useProjectStore.getState().boundaryDetail).toBe('standard');
    expect(getHistoryEntries().past.map((e) => e.label)).toEqual(['Changed detail of Isola to Standard']);

    rerender(<BoundaryInspector item={stored()} />);
    expect(detailRadio(/standard/i)).toHaveAttribute('aria-checked', 'true');
    act(() => { undo(); });
    expect(stored().geojson).toBe(applyBoundaryDetail(island, 'light'));
  });

  it('offers Detail after a period change too', async () => {
    const version = prussia.versions[2];
    const item = { ...setBoundary(), placeName: 'Kingdom of Prussia', source: sourceForVersion(prussia, version) };
    useProjectStore.setState({ items: { b1: item } });
    const { rerender } = render(<BoundaryInspector item={item} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Period' }));
    fireEvent.click(screen.getByRole('option', { name: '18 Jan 1701 – 1815' }));
    await waitFor(() => expect(stored().source?.osmId).toBe('R1'));

    expect(stored().geojson).toBe(applyBoundaryDetail(island, 'light'));
    rerender(<BoundaryInspector item={stored()} />);
    expect(detailRadio(/light/i)).toHaveAttribute('aria-checked', 'true');
  });

  it('hides Detail once the outline is no longer the one picked here (undo)', async () => {
    const { rerender } = render(<BoundaryInspector item={setBoundary()} />);
    clearHistory();
    await pickResult('Isola', isola);
    act(() => { undo(); });

    rerender(<BoundaryInspector item={stored()} />);
    expect(stored().placeName).toBe('Paris');
    expect(screen.queryByText(BOUNDARY_TERMS.detail)).not.toBeInTheDocument();
  });

  it('forgets the picked outline when another boundary is shown', async () => {
    const { rerender } = render(<BoundaryInspector item={setBoundary()} />);
    await pickResult('Isola', isola);
    const other = { ...stored(), id: 'b2' };
    useProjectStore.setState({ items: { ...useProjectStore.getState().items, b2: other } });

    rerender(<BoundaryInspector item={other} />);
    expect(screen.queryByText(BOUNDARY_TERMS.detail)).not.toBeInTheDocument();
  });
});
