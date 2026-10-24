import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { ACCENT_TERMS, CALLOUT_ADD_TERMS } from '@/lib/terms';
import { clearHistory, getHistoryEntries } from '@/store/history';
import '@/annotations/styles/index';
import { AnnotationAddDropdown } from './AnnotationAddDropdown';

vi.mock('@/annotations/inspector/stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/annotations/inspector/stylePreview')>()),
  getStylePreview: vi.fn().mockResolvedValue(null),
}));

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
  const panel = (isOpen: boolean) => (
    <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
      <AnnotationAddDropdown isOpen={isOpen} onOpenChange={onOpenChange} />
    </MapRefContext.Provider>
  );
  const { rerender } = render(panel(true));
  return { close: () => rerender(panel(false)) };
}

const callouts = () => Object.values(useProjectStore.getState().items).filter((i): i is CalloutItem => i.kind === 'callout');
/** The callout the panel previews, before it is added. */
const staged = () => useProjectStore.getState().stagedItems as CalloutItem[];

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
      items: {}, itemOrder: [], stagedItems: [], selectedItemId: null, activePicker: null, playheadTime: 0,
      isPlaying: false, isExporting: false, isScrubbing: false, appearPreview: null,
    });
    clearHistory();
  });

  it('previews a callout named after the place when a search result is chosen, without adding it', async () => {
    renderDropdown();
    await chooseSearchResult('Paris', [2.35, 48.85]);

    await waitFor(() => expect(staged()).toHaveLength(1));
    expect(staged()[0]).toMatchObject({
      binding: { lngLat: [2.35, 48.85] },
      content: { title: 'Paris' },
      locationName: 'Paris',
      linkTitleToLocation: true,
    });
    expect(callouts()).toHaveLength(0);
    expect(useProjectStore.getState().selectedItemId).toBeNull();
    expect(getHistoryEntries().past).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('brings a callout that is off screen into view, at the same zoom', async () => {
    renderDropdown();
    await chooseSearchResult('Paris', [2.35, 48.85]);

    await waitFor(() => expect(easeTo).toHaveBeenCalledTimes(1));
    expect(easeTo.mock.calls[0][0]).toMatchObject({ center: [2.35, 48.85] });
    expect(easeTo.mock.calls[0][0]).not.toHaveProperty('zoom');
  });

  it('leaves the map alone when all of the callout is already in view', () => {
    projected = { x: 400, y: 500 };
    renderDropdown();
    pickOnMap([2.35, 48.85]);
    expect(staged()).toHaveLength(1);
    expect(easeTo).not.toHaveBeenCalled();
  });

  it('plays the entrance of the previewed callout', () => {
    renderDropdown();
    pickOnMap([2.35, 48.85]);
    expect(useProjectStore.getState().appearPreview).toMatchObject({ itemIds: [staged()[0].id] });
  });

  it('previews an unnamed callout when a point is picked on the map', () => {
    renderDropdown();
    pickOnMap([2.35, 48.85]);

    expect(staged()).toHaveLength(1);
    expect(staged()[0]).toMatchObject({
      binding: { lngLat: [2.35, 48.85] },
      content: { title: CALLOUT_ADD_TERMS.defaultTitle },
      locationName: '',
      linkTitleToLocation: false,
    });
  });

  it('moves the preview to the next place chosen, keeping what was set, and the title follows the place', async () => {
    renderDropdown();
    await chooseSearchResult('Paris', [2.35, 48.85]);
    await waitFor(() => expect(staged()).toHaveLength(1));
    const { id } = staged()[0];
    fireEvent.change(screen.getByLabelText('Subtitle'), { target: { value: 'Day 1' } });

    await chooseSearchResult('Berlin', [13.4, 52.52]);
    await waitFor(() => expect(staged()[0].binding).toMatchObject({ lngLat: [13.4, 52.52] }));
    expect(staged()).toHaveLength(1);
    expect(staged()[0]).toMatchObject({ id, content: { title: 'Berlin', subtitle: 'Day 1' }, locationName: 'Berlin' });
  });

  it('renames the previewed callout, and the title stops following the place', async () => {
    renderDropdown();
    expect(screen.queryByRole('textbox', { name: CALLOUT_ADD_TERMS.title })).toBeNull();
    await chooseSearchResult('Paris', [2.35, 48.85]);

    const title = await screen.findByRole('textbox', { name: CALLOUT_ADD_TERMS.title });
    expect(title).toHaveValue('Paris');
    fireEvent.change(title, { target: { value: 'Our office' } });

    expect(staged()[0]).toMatchObject({ content: { title: 'Our office' }, linkTitleToLocation: false });
  });

  it('sets the subtitle, the accent color and the style of the previewed callout', () => {
    renderDropdown();
    pickOnMap([2.35, 48.85]);

    fireEvent.change(screen.getByLabelText('Subtitle'), { target: { value: 'Since 1998' } });
    expect(staged()[0].content.subtitle).toBe('Since 1998');

    expect(screen.getByText(ACCENT_TERMS.accent)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Select color #ef4444'));
    expect(staged()[0].settings).toMatchObject({ lineColor: '#ef4444', accentColor: '#ef4444' });

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.click(screen.getByRole('button', { name: 'Waypoint' }));
    expect(staged()[0]).toMatchObject({ styleId: 'waypoint', content: { subtitle: 'Since 1998' } });
    expect(callouts()).toHaveLength(0);
    expect(getHistoryEntries().past).toHaveLength(0);
  });

  it('adds the previewed callout to the timeline at the playhead, selects it and closes, as one undo step', () => {
    renderDropdown();
    const add = screen.getByRole('button', { name: CALLOUT_ADD_TERMS.add });
    expect(add).toBeDisabled();
    pickOnMap([2.35, 48.85]);
    const { id } = staged()[0];
    act(() => { useProjectStore.setState({ playheadTime: 7 }); });

    fireEvent.click(add);

    expect(callouts()).toEqual([expect.objectContaining({ id, startTime: 7, binding: expect.objectContaining({ lngLat: [2.35, 48.85] }) })]);
    expect(staged()).toEqual([]);
    expect(useProjectStore.getState().selectedItemId).toBe(id);
    expect(getHistoryEntries().past).toHaveLength(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('drops the preview when the panel closes', () => {
    const { close } = renderDropdown();
    pickOnMap([2.35, 48.85]);
    close();
    expect(staged()).toEqual([]);
    expect(callouts()).toHaveLength(0);
  });

  it('says that search results can be approximate and an exact spot is picked on the map', () => {
    renderDropdown();
    expect(screen.getByText(CALLOUT_ADD_TERMS.approximate)).toBeInTheDocument();
  });
});
