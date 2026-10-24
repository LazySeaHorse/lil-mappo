import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';
import { createCalloutItem } from '@/store/itemFactories';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { CALLOUT_LOCATION_TERMS } from '@/lib/terms';
import { AnnotationInspector } from './AnnotationInspector';
import { readInfoTips } from '@/test/infoTips';

vi.mock('./stylePreview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./stylePreview')>()),
  getStylePreview: vi.fn().mockResolvedValue(null),
}));

const { suggest, retrieve } = vi.hoisted(() => ({ suggest: vi.fn(), retrieve: vi.fn() }));

vi.mock('@mapbox/search-js-core', () => ({
  SearchBoxCore: class {},
  SearchSession: class {
    suggest = suggest;
    retrieve = retrieve;
  },
}));

const LOCATION_FIELD = 'Search for a place or enter coordinates';

function setCallout(locationName?: string, lngLat: [number, number] = [-73.96542, 40.78243]) {
  const item = createCalloutItem({ id: 'c1', styleId: 'leader-line', content: { title: 'Park' }, lngLat, startTime: 0, locationName })!;
  useProjectStore.setState({ items: { c1: item }, itemOrder: ['c1'], selectedItemId: 'c1', activePicker: null });
  return item;
}
const stored = () => useProjectStore.getState().items.c1 as CalloutItem;

describe('callout location field', () => {
  beforeEach(() => {
    suggest.mockReset();
    retrieve.mockReset();
  });

  it('shows the place name the callout was created with', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    expect(screen.getByPlaceholderText(LOCATION_FIELD)).toHaveValue('Central Park');
  });

  it('shows the coordinates when no name is known', () => {
    render(<AnnotationInspector item={setCallout('')} />);
    expect(screen.getByPlaceholderText(LOCATION_FIELD)).toHaveValue('-73.96542, 40.78243');
  });

  it('stores the name of a place picked from the search results', async () => {
    suggest.mockResolvedValue({ suggestions: [{ mapbox_id: 'a', name: 'Times Square' }] });
    retrieve.mockResolvedValue({ features: [{ geometry: { coordinates: [-73.9855, 40.758] }, properties: { name: 'Times Square' } }] });
    render(<AnnotationInspector item={setCallout('')} />);

    const input = screen.getByPlaceholderText(LOCATION_FIELD);
    fireEvent.change(input, { target: { value: 'Times Square' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(await screen.findByText('Times Square'));

    await waitFor(() => expect(stored().locationName).toBe('Times Square'));
    expect(stored().binding).toMatchObject({ lngLat: [-73.9855, 40.758] });
  });

  it('stores the name of a place picked on the map, and clears it when the pick has none', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    fireEvent.click(screen.getAllByTitle('Pick on the map')[0]);
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [1, 2], name: 'Pier 17' }); });
    expect(stored().locationName).toBe('Pier 17');

    act(() => { useProjectStore.getState().stopPicking(); });
    fireEvent.click(screen.getAllByTitle('Pick on the map')[0]);
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [3, 4], name: '' }); });
    expect(stored().locationName).toBe('');
  });

  it('keeps the place, the height and the exact position in one Location section', async () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    const location = screen.getByRole('region', { name: 'Location' });
    expect(within(location).getByPlaceholderText(LOCATION_FIELD)).toHaveValue('Central Park');
    expect(within(location).getByTitle('Pick on the map')).toBeInTheDocument();
    expect(within(location).getByText(CALLOUT_LOCATION_TERMS.dragOnMap)).toBeInTheDocument();
    expect(within(location).queryByText(CALLOUT_LOCATION_TERMS.heightHint)).toBeNull();
    expect(await readInfoTips(location)).toEqual([CALLOUT_LOCATION_TERMS.heightHint]);
    expect(within(location).getByText(CALLOUT_LOCATION_TERMS.heightAboveMap)).toBeInTheDocument();
    // The old second section is gone, and so is the old name for the height.
    expect(screen.queryByRole('region', { name: 'Position' })).toBeNull();
    expect(screen.queryByText('Altitude')).toBeNull();
  });

  it('hides the raw coordinates until the user opens Exact position', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    const toggle = screen.getByRole('button', { name: CALLOUT_LOCATION_TERMS.exactPosition });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Longitude')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Longitude')).toHaveValue(-73.96542);
    expect(screen.getByLabelText('Latitude')).toHaveValue(40.78243);
  });

  it('clears the place name and unlinks the title when the user edits the coordinates by hand', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    fireEvent.click(screen.getByRole('button', { name: CALLOUT_LOCATION_TERMS.exactPosition }));
    const latitude = screen.getByLabelText('Latitude');
    fireEvent.change(latitude, { target: { value: '41' } });
    fireEvent.blur(latitude);
    expect(stored().binding).toMatchObject({ lngLat: [-73.96542, 41] });
    expect(stored().locationName).toBe('');
    expect(stored().linkTitleToLocation).toBe(false);
  });

  it('takes typed coordinates in the place field, with no name, and keeps the title', async () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    const input = screen.getByPlaceholderText(LOCATION_FIELD);
    fireEvent.change(input, { target: { value: '2.35, 48.85' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(stored().binding).toMatchObject({ lngLat: [2.35, 48.85] }));
    expect(stored().locationName).toBe('');
    expect(stored().content.title).toBe('Park');
    expect(stored().linkTitleToLocation).toBe(false);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('keeps the title when a map pick has no place name', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    fireEvent.click(screen.getAllByTitle('Pick on the map')[0]);
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [3, 4], name: '' }); });
    expect(stored().content.title).toBe('Park');
    expect(stored().linkTitleToLocation).toBe(false);
  });

  it('still follows the place name with the title when it has one', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    fireEvent.click(screen.getAllByTitle('Pick on the map')[0]);
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [1, 2], name: 'Pier 17' }); });
    expect(stored().content.title).toBe('Pier 17');
    expect(stored().linkTitleToLocation).toBe(true);
  });

  it('only empties the place field when the user clears it, and keeps the callout where it is', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(screen.getByPlaceholderText(LOCATION_FIELD)).toHaveValue('');
    expect(stored().binding).toMatchObject({ lngLat: [-73.96542, 40.78243] });
    expect(stored().locationName).toBe('Central Park');
    expect(stored().content.title).toBe('Park');
  });

  it('puts the title switch and the text fields in their own Text section', () => {
    render(<AnnotationInspector item={setCallout('Central Park')} />);
    const text = screen.getByRole('region', { name: 'Text' });
    expect(within(text).getByText('Use place name as title')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Location' })).queryByText('Use place name as title')).toBeNull();
  });
});
