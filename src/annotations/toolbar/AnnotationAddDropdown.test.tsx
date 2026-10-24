import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { CALLOUT_ADD_TERMS } from '@/lib/terms';
import '@/annotations/styles/index';
import { AnnotationAddDropdown } from './AnnotationAddDropdown';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));

const { suggest, retrieve } = vi.hoisted(() => ({ suggest: vi.fn(), retrieve: vi.fn() }));
vi.mock('@mapbox/search-js-core', () => ({
  SearchBoxCore: class {},
  SearchSession: class {
    suggest = suggest;
    retrieve = retrieve;
  },
}));

const easeTo = vi.fn();
let projected = { x: 5000, y: 400 };
const map = {
  getContainer: () => ({ clientWidth: 1200, clientHeight: 800, getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
  getCenter: () => ({ lng: 0, lat: 0 }),
  getBounds: () => null,
  getZoom: () => 4,
  project: () => projected,
  fitBounds: vi.fn(),
  easeTo,
};

const onOpenChange = vi.fn();

function renderDropdown() {
  render(
    <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
      <AnnotationAddDropdown isOpen onOpenChange={onOpenChange} />
    </MapRefContext.Provider>,
  );
}

const callouts = () => Object.values(useProjectStore.getState().items).filter((i): i is CalloutItem => i.kind === 'callout');

function pickOnMap(lngLat: [number, number]) {
  fireEvent.click(screen.getByTitle('Pick on the map'));
  act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat, name: `${lngLat[0]}, ${lngLat[1]}` }); });
}

async function chooseSearchResult(name: string, lngLat: [number, number]) {
  suggest.mockResolvedValue({ suggestions: [{ mapbox_id: name, name }] });
  retrieve.mockResolvedValue({ features: [{ geometry: { coordinates: lngLat }, properties: { name } }] });
  const input = screen.getByPlaceholderText(CALLOUT_ADD_TERMS.search);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.click(await screen.findByText(name));
}

describe('AnnotationAddDropdown', () => {
  beforeEach(() => {
    easeTo.mockClear();
    onOpenChange.mockClear();
    suggest.mockReset();
    retrieve.mockReset();
    projected = { x: 5000, y: 400 };
    useProjectStore.setState({
      items: {}, itemOrder: [], selectedItemId: null, activePicker: null, playheadTime: 0,
      isPlaying: false, isExporting: false, isScrubbing: false,
    });
  });

  it('adds a callout named after the place as soon as a search result is chosen, selects it and keeps the panel open', async () => {
    renderDropdown();
    await chooseSearchResult('Paris', [2.35, 48.85]);

    await waitFor(() => expect(callouts()).toHaveLength(1));
    const [callout] = callouts();
    expect(callout).toMatchObject({
      binding: { lngLat: [2.35, 48.85] },
      content: { title: 'Paris' },
      locationName: 'Paris',
      linkTitleToLocation: true,
    });
    expect(useProjectStore.getState().selectedItemId).toBe(callout.id);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.queryByRole('button', { name: /Create callout/i })).toBeNull();
  });

  it('brings a new callout that is off screen into view, at the same zoom', async () => {
    renderDropdown();
    await chooseSearchResult('Paris', [2.35, 48.85]);

    await waitFor(() => expect(easeTo).toHaveBeenCalledTimes(1));
    expect(easeTo.mock.calls[0][0]).toMatchObject({ center: [2.35, 48.85] });
    expect(easeTo.mock.calls[0][0]).not.toHaveProperty('zoom');
  });

  it('leaves the map alone when all of the new callout is already in view', () => {
    projected = { x: 400, y: 500 };
    renderDropdown();
    pickOnMap([2.35, 48.85]);
    expect(callouts()).toHaveLength(1);
    expect(easeTo).not.toHaveBeenCalled();
  });

  it('adds an unnamed callout as soon as a point is picked on the map', () => {
    renderDropdown();
    pickOnMap([2.35, 48.85]);

    expect(callouts()).toHaveLength(1);
    expect(callouts()[0]).toMatchObject({
      binding: { lngLat: [2.35, 48.85] },
      content: { title: CALLOUT_ADD_TERMS.defaultTitle },
      locationName: '',
      linkTitleToLocation: false,
    });
  });

  it('renames the callout just added from the panel, and the title stops following the place', async () => {
    renderDropdown();
    expect(screen.queryByRole('textbox', { name: CALLOUT_ADD_TERMS.title })).toBeNull();
    await chooseSearchResult('Paris', [2.35, 48.85]);

    const title = await screen.findByRole('textbox', { name: CALLOUT_ADD_TERMS.title });
    expect(title).toHaveValue('Paris');
    fireEvent.change(title, { target: { value: 'Our office' } });

    expect(callouts()[0]).toMatchObject({ content: { title: 'Our office' }, linkTitleToLocation: false });
  });

  it('adds another callout for the next place, and empties the search for it', async () => {
    renderDropdown();
    await chooseSearchResult('Paris', [2.35, 48.85]);
    await waitFor(() => expect(callouts()).toHaveLength(1));
    expect(screen.getByPlaceholderText(CALLOUT_ADD_TERMS.search)).toHaveValue('');

    pickOnMap([13.4, 52.52]);
    expect(callouts()).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: CALLOUT_ADD_TERMS.title })).toHaveValue(CALLOUT_ADD_TERMS.defaultTitle);
  });

  it('says that search results can be approximate and an exact spot is picked on the map', () => {
    renderDropdown();
    expect(screen.getByText(CALLOUT_ADD_TERMS.approximate)).toBeInTheDocument();
  });
});
