import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { BoundaryInspector } from './BoundaryInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { createBoundaryItem } from '@/store/itemFactories';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { sourceForVersion } from '@/engine/historicalSource';
import { HISTORICAL_TERMS } from '@/lib/terms';
import { searchBoundaries } from '@/services/boundarySearch';
import { fetchHistoricalOutline, type HistoricalOutline } from '@/services/openHistoricalMap';
import { outlineOf, prussia } from '@/test/historicalFixtures';
import type { BoundaryItem } from '@/store/types';

vi.mock('@/services/boundarySearch', () => ({ searchBoundaries: vi.fn() }));
vi.mock('@/services/openHistoricalMap', () => ({ fetchHistoricalOutline: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SEARCH = 'Search for a place or region';
const square = (x: number): GeoJSON.Polygon => ({ type: 'Polygon', coordinates: [[[x, 48], [x + 1, 48], [x + 1, 49], [x, 48]]] });
const lyon = { kind: 'present' as const, placeName: 'Lyon', displayName: 'Lyon, France', type: 'city', countryCode: null, geojson: square(4) };

const stored = () => useProjectStore.getState().items.b1 as BoundaryItem;
const periodPicker = () => screen.getByRole('combobox', { name: HISTORICAL_TERMS.period });
const choosePeriod = (range: string) => {
  fireEvent.click(periodPicker());
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: range }));
};
const R1 = '18 Jan 1701 – 1815';
const R2 = '1815 – 1867';

/** A boundary that came from the latest period of Prussia. */
function setHistorical() {
  const version = prussia.versions[2];
  const item = createBoundaryItem({
    id: 'b1',
    placeName: 'Kingdom of Prussia',
    geojson: applyBoundaryDetail(outlineOf('R3').geojson),
    startTime: 0,
    source: sourceForVersion(prussia, version),
  });
  useProjectStore.setState({ items: { b1: item }, itemOrder: ['b1'], selectedItemId: 'b1' });
  return item;
}

function setPresent() {
  const item = createBoundaryItem({ id: 'b1', placeName: 'Paris', geojson: square(2), startTime: 0 });
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

function deferredOutline() {
  let resolve!: (outline: HistoricalOutline) => void;
  const promise = new Promise<HistoricalOutline>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('BoundaryInspector historical areas', () => {
  beforeEach(() => {
    vi.mocked(fetchHistoricalOutline).mockReset();
    vi.mocked(fetchHistoricalOutline).mockImplementation(async (osmId) => outlineOf(osmId));
    vi.mocked(toast.error).mockClear();
    useProjectStore.setState({ items: {}, itemOrder: [] });
    clearHistory();
  });

  it('shows no period for a present-day area', () => {
    render(<BoundaryInspector item={setPresent()} />);
    expect(screen.queryByText(HISTORICAL_TERMS.period)).not.toBeInTheDocument();
  });

  it('shows the picker with the current period for a historical area', () => {
    render(<BoundaryInspector item={setHistorical()} />);
    expect(periodPicker()).toHaveTextContent('1867 – 9 Nov 1918');
  });

  it('shows the date range as plain text when the place has one period', () => {
    const version = { osmId: 'R7', startDate: '1958', endDate: null };
    const item = { ...setPresent(), source: sourceForVersion({ wikidata: null, versions: [version] }, version) };
    useProjectStore.setState({ items: { b1: item } });
    render(<BoundaryInspector item={item} />);
    expect(screen.getByText('1958 – present')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: HISTORICAL_TERMS.period })).not.toBeInTheDocument();
  });

  it('changing the period swaps the outline and the source in one undo step', async () => {
    const item = setHistorical();
    const { rerender } = render(<BoundaryInspector item={item} />);
    clearHistory();

    choosePeriod(R1);
    await waitFor(() => expect(stored().source?.osmId).toBe('R1'));

    expect(fetchHistoricalOutline).toHaveBeenCalledWith('R1', expect.any(AbortSignal));
    expect(stored().geojson).toEqual(applyBoundaryDetail(outlineOf('R1').geojson));
    expect(stored().source).toMatchObject({ osmId: 'R1', startDate: '1701-01-18', endDate: '1815', wikidata: 'Q27306' });
    expect(stored().source!.versions).toHaveLength(3);
    expect(stored().placeName).toBe('Kingdom of Prussia');
    expect(getHistoryEntries().past).toHaveLength(1);
    expect(getHistoryEntries().past[0].label).toBe('Changed period of Kingdom of Prussia to 1701–1815');

    rerender(<BoundaryInspector item={stored()} />);
    expect(periodPicker()).toHaveTextContent(R1);
    act(() => { undo(); });
    expect(stored().source?.osmId).toBe('R3');
    expect(stored().geojson).toEqual(item.geojson);
  });

  it('drops an outline that arrives after the user picked another place', async () => {
    const slow = deferredOutline();
    vi.mocked(fetchHistoricalOutline).mockReturnValueOnce(slow.promise);
    render(<BoundaryInspector item={setHistorical()} />);

    choosePeriod(R1);
    expect(periodPicker()).toBeDisabled();
    await pickResult('Lyon', lyon);
    await act(async () => { slow.resolve(outlineOf('R1')); });

    expect(stored().placeName).toBe('Lyon');
    expect(stored().source).toBeNull();
    expect(stored().geojson).toEqual(applyBoundaryDetail(square(4)));
  });

  it('keeps the area and shows a toast when the period cannot be loaded', async () => {
    const item = setHistorical();
    render(<BoundaryInspector item={item} />);
    vi.mocked(fetchHistoricalOutline).mockRejectedValueOnce(new Error('boom'));
    choosePeriod(R2);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(HISTORICAL_TERMS.loadFailed));
    expect(stored()).toBe(item);
    expect(periodPicker()).toHaveTextContent('1867 – 9 Nov 1918');
    expect(periodPicker()).toBeEnabled();
  });

  it('picking a present place clears the source and the period picker', async () => {
    const { rerender } = render(<BoundaryInspector item={setHistorical()} />);
    await pickResult('Lyon', lyon);

    expect(stored()).toMatchObject({ placeName: 'Lyon', source: null });
    rerender(<BoundaryInspector item={stored()} />);
    expect(screen.queryByRole('combobox', { name: HISTORICAL_TERMS.period })).not.toBeInTheDocument();
  });

  it('picking a historical place sets its latest period, outline and source', async () => {
    const { rerender } = render(<BoundaryInspector item={setPresent()} />);
    clearHistory();
    await pickResult('Kingdom of Prussia', prussia);
    await waitFor(() => expect(stored().source?.osmId).toBe('R3'));

    expect(fetchHistoricalOutline).toHaveBeenCalledWith('R3', expect.any(AbortSignal));
    expect(stored()).toMatchObject({
      placeName: 'Kingdom of Prussia',
      geojson: applyBoundaryDetail(outlineOf('R3').geojson),
      source: { provider: 'ohm', osmId: 'R3', wikidata: 'Q27306' },
    });
    expect(getHistoryEntries().past).toHaveLength(1);
    rerender(<BoundaryInspector item={stored()} />);
    expect(periodPicker()).toHaveTextContent('1867 – 9 Nov 1918');
  });
});
