import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/annotations/styles/index';
import { createCalloutItem } from '@/store/itemFactories';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import { AnnotationInspector } from './AnnotationInspector';

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
    fireEvent.click(screen.getAllByTitle('Pick on Map')[0]);
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [1, 2], name: 'Pier 17' }); });
    expect(stored().locationName).toBe('Pier 17');

    act(() => { useProjectStore.getState().stopPicking(); });
    fireEvent.click(screen.getAllByTitle('Pick on Map')[0]);
    act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [3, 4], name: '' }); });
    expect(stored().locationName).toBe('');
  });
});
