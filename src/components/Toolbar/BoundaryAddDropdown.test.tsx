import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { useProjectStore } from '@/store/useProjectStore';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { syntheticIsland } from '@/test/syntheticGeometry';
import type { BoundaryItem, CalloutItem } from '@/store/types';
import { clearHistory, getHistoryEntries, undo } from '@/store/history';
import { BOUNDARY_ADD_TERMS } from '@/lib/terms';
import '@/annotations/styles';
import { MapRefContext } from '@/hooks/useMapRef';
import type { MapRef } from 'react-map-gl/mapbox';

const island = syntheticIsland();

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));

vi.mock('../Inspector/BoundarySearch', () => ({
  BoundarySearch: ({ onSelect }: { onSelect: (r: unknown) => void }) => (
    <>
      <button onClick={() => onSelect({ display_name: 'Isola, Italia', type: 'island', geojson: island, countryCode: 'it' })}>pick-result</button>
      <button onClick={() => onSelect({ display_name: 'Citta, Italia', type: 'city', geojson: island, countryCode: null })}>pick-city</button>
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
