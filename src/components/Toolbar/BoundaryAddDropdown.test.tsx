import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { useProjectStore } from '@/store/useProjectStore';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { syntheticIsland } from '@/test/syntheticGeometry';
import type { BoundaryItem, CalloutItem } from '@/store/types';
import { undo } from '@/store/history';
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
const added = () => boundaries().at(-1)!;
const onOpenChange = vi.fn();

function open() {
  render(<BoundaryAddDropdown isOpen onOpenChange={onOpenChange} />);
}

const choose = (button = 'pick-result') => act(() => { fireEvent.click(screen.getByText(button)); });

const toggle = (label: string) => {
  fireEvent.click(screen.getByText(label).parentElement!.parentElement!.querySelector('[role="switch"]')!);
};

describe('BoundaryAddDropdown', () => {
  beforeEach(() => {
    onOpenChange.mockClear();
    useProjectStore.setState({ items: {}, itemOrder: [], selectedItemId: null, playheadTime: 0, appearPreview: null });
    useProjectStore.getState().setBoundaryDetail('standard');
  });

  it('adds the boundary as soon as a result is chosen, selects it, plays its entrance and stays open', () => {
    open();
    expect(screen.getByText(BOUNDARY_ADD_TERMS.empty)).toBeInTheDocument();
    choose();

    expect(boundaries()).toHaveLength(1);
    expect(added()).toMatchObject({ placeName: 'Isola', geojson: applyBoundaryDetail(island, 'standard') });
    expect(useProjectStore.getState().selectedItemId).toBe(added().id);
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [added().id] });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: /insert boundary/i })).toBeNull();
  });

  it('shows Detailed / Standard / Light with Standard selected by default and the helper text', () => {
    open();
    choose();
    expect(screen.getByRole('radio', { name: /detailed/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /standard/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/can't be changed once this panel is closed/i)).toBeInTheDocument();
  });

  it('changes the detail of the boundary just added, plays it again, and remembers the level for the session', () => {
    open();
    choose();
    useProjectStore.setState({ appearPreview: null });

    fireEvent.click(screen.getByRole('radio', { name: /light/i }));
    expect(added().geojson).toEqual(applyBoundaryDetail(island, 'light'));
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [added().id] });

    fireEvent.click(screen.getByRole('radio', { name: /detailed/i }));
    expect(added().geojson).toEqual(applyBoundaryDetail(island, 'detailed'));
    expect(useProjectStore.getState().boundaryDetail).toBe('detailed');
  });

  it('prefills the flag code from the chosen result and leaves the fill mode alone', () => {
    open();
    choose();
    expect(added().style).toMatchObject({ flagCode: 'it', fillMode: 'color' });
  });

  it('fills the boundary just added with its flag and dims its surroundings from the switches', () => {
    open();
    choose();
    toggle('Flag');
    toggle('Dim surroundings');
    expect(added().style).toMatchObject({ fillMode: 'flag', flagCode: 'it', fillOpacity: 1, maskOutside: true, maskOpacity: 0.7 });
  });

  it('puts the fill opacity back when Flag is turned off again', () => {
    open();
    choose();
    toggle('Flag');
    toggle('Flag');
    expect(added().style).toMatchObject({ fillMode: 'color', fillOpacity: 0.1 });
  });

  it('adds a Map Label at the visual centre, timed like the boundary, that plays with it, and takes it away again', () => {
    open();
    choose();
    toggle('Name label');

    expect(labels()).toHaveLength(1);
    const [label] = labels();
    expect(label).toMatchObject({ styleId: 'map-label', content: { title: 'Isola' }, startTime: added().startTime, endTime: added().endTime });
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [added().id, label.id] });

    toggle('Name label');
    expect(labels()).toHaveLength(0);
  });

  it('adds the label with the next boundary, in the same undo step', () => {
    open();
    choose();
    toggle('Name label');
    choose();

    expect(boundaries()).toHaveLength(2);
    expect(labels()).toHaveLength(2);
    expect(useProjectStore.getState().appearPreview?.itemIds).toHaveLength(2);
    act(() => { undo(); });
    expect(boundaries()).toHaveLength(1);
    expect(labels()).toHaveLength(1);
  });

  it('adds another boundary for the next result, with the same options', () => {
    open();
    choose();
    toggle('Flag');
    toggle('Dim surroundings');
    choose();

    expect(boundaries()).toHaveLength(2);
    expect(added().style).toMatchObject({ fillMode: 'flag', maskOutside: true });
  });

  it('adds no label by default, and offers Flag only for a country', () => {
    open();
    choose();
    expect(screen.getByText('Flag')).toBeInTheDocument();
    expect(labels()).toHaveLength(0);

    toggle('Flag');
    choose('pick-city');
    expect(added().style).toMatchObject({ flagCode: null, fillMode: 'color', fillOpacity: 0.1 });
    expect(screen.queryByText('Flag')).not.toBeInTheDocument();
  });

  it('goes back to the empty panel when the boundary is undone', () => {
    open();
    choose();
    act(() => { undo(); });
    expect(boundaries()).toHaveLength(0);
    expect(screen.getByText(BOUNDARY_ADD_TERMS.empty)).toBeInTheDocument();
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
