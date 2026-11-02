import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { useProjectStore } from '@/store/useProjectStore';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { syntheticIsland } from '@/test/syntheticGeometry';
import type { BoundaryItem, CalloutItem } from '@/store/types';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import { BOUNDARY_ADD_TERMS, HISTORICAL_TERMS } from '@/lib/terms';
import { fetchHistoricalOutline, type HistoricalOutline } from '@/services/openHistoricalMap';
import { outlineOf, prussia } from '@/test/historicalFixtures';
import { readInfoTips } from '@/test/infoTips';
import { toast } from 'sonner';
import '@/annotations/styles';
import { MapRefContext } from '@/hooks/useMapRef';
import type { MapRef } from 'react-map-gl/mapbox';

const island = syntheticIsland();

vi.mock('@/services/openHistoricalMap', () => ({ fetchHistoricalOutline: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));

vi.mock('../Inspector/BoundarySearch', () => ({
  BoundarySearch: ({ onSelect }: { onSelect: (r: unknown) => void }) => (
    <>
      <button onClick={() => onSelect({ kind: 'present', placeName: 'Isola', displayName: 'Isola, Italia', type: 'island', geojson: island, countryCode: 'it' })}>pick-result</button>
      <button onClick={() => onSelect(prussia)}>pick-historical</button>
      <button onClick={() => onSelect({ kind: 'present', placeName: 'Citta', displayName: 'Citta, Italia', type: 'city', geojson: island, countryCode: null })}>pick-city</button>
    </>
  ),
}));

const boundaries = () => Object.values(useProjectStore.getState().items).filter((i): i is BoundaryItem => i.kind === 'boundary');
const labels = () => Object.values(useProjectStore.getState().items).filter((i): i is CalloutItem => i.kind === 'callout');
/** The boundary the panel previews, and its label, before they are added. */
const staged = () => useProjectStore.getState().stagedItems.find((i): i is BoundaryItem => i.kind === 'boundary')!;
const stagedLabels = () => useProjectStore.getState().stagedItems.filter((i): i is CalloutItem => i.kind === 'callout');
const onOpenChange = vi.fn();

function open() {
  const panel = (isOpen: boolean) => <BoundaryAddDropdown isOpen={isOpen} onOpenChange={onOpenChange} />;
  const { rerender } = render(panel(true));
  return { close: () => rerender(panel(false)) };
}

const choose = (button = 'pick-result') => act(() => { fireEvent.click(screen.getByText(button)); });
const add = () => fireEvent.click(screen.getByRole('button', { name: BOUNDARY_ADD_TERMS.add }));

const toggle = (label: string) => {
  fireEvent.click(screen.getByText(label).parentElement!.parentElement!.querySelector('[role="switch"]')!);
};

describe('BoundaryAddDropdown', () => {
  beforeEach(() => {
    onOpenChange.mockClear();
    useProjectStore.setState({ items: {}, itemOrder: [], stagedItems: [], selectedItemId: null, playheadTime: 0, appearPreview: null });
    useProjectStore.getState().setBoundaryDetail('standard');
    clearHistory();
  });

  it('previews the boundary when a result is chosen, plays its entrance, and does not add it yet', () => {
    open();
    expect(screen.getByText(BOUNDARY_ADD_TERMS.empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BOUNDARY_ADD_TERMS.add })).toBeDisabled();
    choose();

    expect(staged()).toMatchObject({ placeName: 'Isola', geojson: applyBoundaryDetail(island, 'standard') });
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [staged().id] });
    expect(boundaries()).toHaveLength(0);
    expect(useProjectStore.getState().selectedItemId).toBeNull();
    expect(getHistoryEntries().past).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('adds the previewed boundary to the timeline at the playhead, selects it and closes, as one undo step', () => {
    open();
    choose();
    const { id } = staged();
    act(() => { useProjectStore.setState({ playheadTime: 4 }); });
    add();

    expect(boundaries()).toEqual([expect.objectContaining({ id, placeName: 'Isola', startTime: 4 })]);
    expect(useProjectStore.getState().stagedItems).toEqual([]);
    expect(useProjectStore.getState().selectedItemId).toBe(id);
    expect(getHistoryEntries().past).toHaveLength(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('drops the preview when the panel closes', () => {
    const { close } = open();
    choose();
    close();
    expect(useProjectStore.getState().stagedItems).toEqual([]);
    expect(boundaries()).toHaveLength(0);
  });

  it('shows Detailed / Standard / Light with Standard selected by default and the helper text', () => {
    open();
    choose();
    expect(screen.getByRole('radio', { name: /detailed/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /standard/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/can't be changed once this panel is closed/i)).toBeInTheDocument();
  });

  it('changes the detail of the preview, plays it again, and remembers the level for the session', () => {
    open();
    choose();
    useProjectStore.setState({ appearPreview: null });

    fireEvent.click(screen.getByRole('radio', { name: /light/i }));
    expect(staged().geojson).toEqual(applyBoundaryDetail(island, 'light'));
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [staged().id] });

    fireEvent.click(screen.getByRole('radio', { name: /detailed/i }));
    expect(staged().geojson).toEqual(applyBoundaryDetail(island, 'detailed'));
    expect(useProjectStore.getState().boundaryDetail).toBe('detailed');
  });

  it('prefills the flag code from the chosen result and leaves the fill mode alone', () => {
    open();
    choose();
    expect(staged().style).toMatchObject({ flagCode: 'it', fillMode: 'color' });
  });

  it('fills the preview with its flag and dims its surroundings from the switches', () => {
    open();
    choose();
    toggle('Flag');
    toggle('Dim surroundings');
    expect(staged().style).toMatchObject({ fillMode: 'flag', flagCode: 'it', fillOpacity: 1, maskOutside: true, maskOpacity: 0.7 });
    expect(getHistoryEntries().past).toHaveLength(0);
  });

  it('puts the fill opacity back when Flag is turned off again', () => {
    open();
    choose();
    toggle('Flag');
    toggle('Flag');
    expect(staged().style).toMatchObject({ fillMode: 'color', fillOpacity: 0.1 });
  });

  it('previews a Map Label at the visual centre, timed like the boundary, that plays with it, and takes it away again', () => {
    open();
    choose();
    toggle('Name label');

    expect(stagedLabels()).toHaveLength(1);
    const [label] = stagedLabels();
    expect(label).toMatchObject({ styleId: 'map-label', content: { title: 'Isola' }, startTime: staged().startTime, endTime: staged().endTime });
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [staged().id, label.id] });

    toggle('Name label');
    expect(stagedLabels()).toHaveLength(0);
  });

  it('adds the label with the boundary, in the same undo step', () => {
    open();
    choose();
    toggle('Name label');
    act(() => { useProjectStore.setState({ playheadTime: 3 }); });
    add();

    expect(boundaries()).toHaveLength(1);
    expect(labels()).toEqual([expect.objectContaining({ startTime: 3, endTime: boundaries()[0].endTime })]);
    act(() => { undo(); });
    expect(boundaries()).toHaveLength(0);
    expect(labels()).toHaveLength(0);
  });

  it('replaces the preview with the next result, keeping the options and the label', () => {
    open();
    choose();
    toggle('Flag');
    toggle('Dim surroundings');
    toggle('Name label');
    const first = staged().id;
    choose();

    expect(staged().id).not.toBe(first);
    expect(useProjectStore.getState().stagedItems).toHaveLength(2);
    expect(staged().style).toMatchObject({ fillMode: 'flag', maskOutside: true });
  });

  it('adds no label by default, and offers Flag only for a country', () => {
    open();
    choose();
    expect(screen.getByText('Flag')).toBeInTheDocument();
    expect(stagedLabels()).toHaveLength(0);

    toggle('Flag');
    choose('pick-city');
    expect(staged().style).toMatchObject({ flagCode: null, fillMode: 'color', fillOpacity: 0.1 });
    expect(screen.queryByText('Flag')).not.toBeInTheDocument();
  });
});

/** A download the test settles itself, to place a second pick or period change in the middle of it. */
function deferredOutline() {
  let resolve!: (outline: HistoricalOutline) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<HistoricalOutline>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const periodPicker = () => screen.getByRole('combobox', { name: HISTORICAL_TERMS.period });
const choosePeriod = (range: string) => {
  fireEvent.click(periodPicker());
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: range }));
};
const R1 = '18 Jan 1701 – 1815';
const R2 = '1815 – 1867';
const R3 = '1867 – 9 Nov 1918';

describe('BoundaryAddDropdown historical places', () => {
  beforeEach(() => {
    onOpenChange.mockClear();
    vi.mocked(fetchHistoricalOutline).mockReset();
    vi.mocked(fetchHistoricalOutline).mockImplementation(async (osmId) => outlineOf(osmId));
    vi.mocked(toast.error).mockClear();
    useProjectStore.setState({ items: {}, itemOrder: [], stagedItems: [], selectedItemId: null, playheadTime: 0, appearPreview: null });
    useProjectStore.getState().setBoundaryDetail('standard');
    clearHistory();
  });

  it('stages the latest period with its source, shows the dates and plays the entrance', async () => {
    open();
    choose('pick-historical');
    await waitFor(() => expect(staged()).toBeDefined());

    expect(fetchHistoricalOutline).toHaveBeenCalledWith('R3', expect.any(AbortSignal));
    expect(staged()).toMatchObject({
      placeName: 'Kingdom of Prussia',
      geojson: applyBoundaryDetail(outlineOf('R3').geojson, 'standard'),
      source: { provider: 'ohm', osmId: 'R3', wikidata: 'Q27306', startDate: '1867', endDate: '1918-11-09' },
    });
    expect(staged().source!.versions.map((v) => v.osmId)).toEqual(['R1', 'R2', 'R3']);
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [staged().id] });
    expect(screen.getByText('1867–1918')).toBeInTheDocument();
    expect(periodPicker()).toHaveTextContent(R3);
    expect(screen.queryByText('Flag')).not.toBeInTheDocument(); // no country code, so no Flag switch
  });

  it('shows a loading state while the outline downloads, and keeps Add off until it arrives', async () => {
    const download = deferredOutline();
    vi.mocked(fetchHistoricalOutline).mockReturnValueOnce(download.promise);
    open();
    choose('pick-historical');

    expect(screen.getByText(HISTORICAL_TERMS.loading)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BOUNDARY_ADD_TERMS.add })).toBeDisabled();
    await act(async () => { download.resolve(outlineOf('R3')); });
    await waitFor(() => expect(staged()).toBeDefined());
    expect(screen.queryByText(HISTORICAL_TERMS.loading)).not.toBeInTheDocument();
  });

  it('changing the period fetches that outline and stages it again, keeping the options', async () => {
    open();
    choose('pick-historical');
    await waitFor(() => expect(staged()).toBeDefined());
    toggle('Dim surroundings');
    toggle('Name label');
    const first = staged().id;
    useProjectStore.setState({ appearPreview: null });

    choosePeriod(R1);
    await waitFor(() => expect(staged().source?.osmId).toBe('R1'));

    expect(staged().id).not.toBe(first);
    expect(staged().geojson).toEqual(applyBoundaryDetail(outlineOf('R1').geojson, 'standard'));
    expect(staged().source).toMatchObject({ startDate: '1701-01-18', endDate: '1815' });
    expect(staged().style.maskOutside).toBe(true);
    expect(stagedLabels()).toHaveLength(1);
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [staged().id, stagedLabels()[0].id] });
    expect(periodPicker()).toHaveTextContent(R1);
    expect(getHistoryEntries().past).toHaveLength(0);
  });

  it('ignores an outline that arrives after the user chose another period', async () => {
    open();
    choose('pick-historical');
    await waitFor(() => expect(staged()).toBeDefined());

    const slow = deferredOutline();
    vi.mocked(fetchHistoricalOutline).mockReturnValueOnce(slow.promise);
    choosePeriod(R1);
    // The picker is locked while loading; the user instead picks another place and then comes back.
    choose('pick-result');
    expect(staged().placeName).toBe('Isola');
    await act(async () => { slow.resolve(outlineOf('R1')); });

    expect(staged().placeName).toBe('Isola');
    expect(staged().source).toBeNull();
    expect(screen.queryByRole('combobox', { name: HISTORICAL_TERMS.period })).not.toBeInTheDocument();
  });

  it('keeps the newest of two quick historical picks', async () => {
    const slow = deferredOutline();
    vi.mocked(fetchHistoricalOutline).mockReturnValueOnce(slow.promise);
    open();
    choose('pick-historical'); // R3, slow
    vi.mocked(fetchHistoricalOutline).mockImplementationOnce(async (osmId) => outlineOf(osmId));
    choose('pick-historical'); // R3 again, fast
    await waitFor(() => expect(staged()).toBeDefined());
    await act(async () => { slow.resolve({ ...outlineOf('R3'), geojson: island as GeoJSON.Polygon }); });

    expect(staged().geojson).toEqual(applyBoundaryDetail(outlineOf('R3').geojson, 'standard'));
  });

  it('shows a toast when the outline cannot be loaded and keeps the earlier preview', async () => {
    open();
    choose();
    vi.mocked(fetchHistoricalOutline).mockRejectedValueOnce(new Error('OpenHistoricalMap error: 500'));
    choose('pick-historical');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(HISTORICAL_TERMS.loadFailed));

    expect(staged().placeName).toBe('Isola');
    expect(screen.queryByText(HISTORICAL_TERMS.loading)).not.toBeInTheDocument();
  });

  it('puts the OpenHistoricalMap notes of the chosen period in the picker hint', async () => {
    open();
    choose('pick-historical');
    await waitFor(() => expect(staged()).toBeDefined());
    expect(await readInfoTips()).not.toContain(HISTORICAL_TERMS.notes(['needs source for boundary lines']));

    choosePeriod(R2);
    await waitFor(() => expect(staged().source?.osmId).toBe('R2'));
    expect(await readInfoTips()).toContain('OpenHistoricalMap notes: needs source for boundary lines');
  });

  it('adds the historical boundary with its source', async () => {
    open();
    choose('pick-historical');
    await waitFor(() => expect(staged()).toBeDefined());
    add();
    expect(boundaries()).toEqual([expect.objectContaining({ placeName: 'Kingdom of Prussia', source: expect.objectContaining({ osmId: 'R3' }) })]);
  });

  it('shows a present place with no source and no period picker', () => {
    open();
    choose();
    expect(staged().source).toBeNull();
    expect(screen.queryByRole('combobox', { name: HISTORICAL_TERMS.period })).not.toBeInTheDocument();
    expect(fetchHistoricalOutline).not.toHaveBeenCalled();
  });

  it('turns on the Flag switch for an outline with a country code', async () => {
    vi.mocked(fetchHistoricalOutline).mockResolvedValueOnce({ ...outlineOf('R3'), countryCode: 'de' });
    open();
    choose('pick-historical');
    await waitFor(() => expect(staged()).toBeDefined());
    expect(screen.getByText('Flag')).toBeInTheDocument();
    expect(staged().style.flagCode).toBe('de');
  });
});

describe('BoundaryAddDropdown map framing', () => {
  const fitBounds = vi.fn();
  const map = {
    getContainer: () => ({ clientWidth: 1200, clientHeight: 800, getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
    getZoom: () => 5,
    project: () => ({ x: 600, y: 400 }),
    fitBounds,
    easeTo: vi.fn(),
  };

  it('fits the map to the chosen place, clear of the panels', () => {
    fitBounds.mockClear();
    useProjectStore.setState({ isPlaying: false, isScrubbing: false, isExporting: false });
    render(
      <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
        <BoundaryAddDropdown isOpen onOpenChange={vi.fn()} />
      </MapRefContext.Provider>,
    );
    fireEvent.click(screen.getByText('pick-result'));
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0][1].padding.top).toBeGreaterThanOrEqual(88);
  });
});
