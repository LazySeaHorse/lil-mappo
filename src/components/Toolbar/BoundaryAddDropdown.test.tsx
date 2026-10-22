import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { PreviewBoundaryLayer } from '@/components/MapViewport/PreviewBoundaryLayer';
import { useProjectStore } from '@/store/useProjectStore';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { syntheticIsland } from '@/test/syntheticGeometry';
import type { BoundaryItem } from '@/store/types';
import { undo } from '@/store/history';
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

vi.mock('react-map-gl/mapbox', () => ({
  Source: ({ id, data }: { id: string; data: unknown }) => <div data-testid={id} data-json={JSON.stringify(data)} />,
  Layer: () => null,
}));

const ringLen = (g: GeoJSON.Geometry) => (g as GeoJSON.Polygon).coordinates[0].length;
const added = () => Object.values(useProjectStore.getState().items).find((i) => i.kind === 'boundary') as BoundaryItem;

describe('BoundaryAddDropdown detail levels', () => {
  beforeEach(() => {
    useProjectStore.setState({ items: {}, itemOrder: [], selectedItemId: null, playheadTime: 0 });
    useProjectStore.getState().clearPreviewBoundary();
    useProjectStore.getState().setBoundaryDetail('standard');
  });

  const open = () => {
    render(<><BoundaryAddDropdown isOpen onOpenChange={vi.fn()} /><PreviewBoundaryLayer /></>);
    fireEvent.click(screen.getByText('pick-result'));
  };

  it('shows Detailed / Standard / Light with Standard selected by default and the helper text', () => {
    open();
    expect(screen.getByRole('radio', { name: /detailed/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /standard/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/can't be changed later/i)).toBeInTheDocument();
  });

  it('adds the boundary at Standard by default', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    expect(added().geojson).toEqual(applyBoundaryDetail(island, 'standard'));
  });

  it('adds at the selected level and the map preview reflects it', () => {
    open();
    const previewLen = () => ringLen(JSON.parse(screen.getByTestId('preview-boundary-stroke').getAttribute('data-json')!).features[0].geometry);
    expect(previewLen()).toBe(ringLen(applyBoundaryDetail(island, 'standard')));

    fireEvent.click(screen.getByRole('radio', { name: /light/i }));
    expect(previewLen()).toBe(ringLen(applyBoundaryDetail(island, 'light')));
    expect(previewLen()).toBeLessThan(ringLen(applyBoundaryDetail(island, 'standard')));

    fireEvent.click(screen.getByRole('radio', { name: /detailed/i }));
    expect(previewLen()).toBe(ringLen(applyBoundaryDetail(island, 'detailed')));

    fireEvent.click(screen.getByRole('radio', { name: /light/i }));
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    expect(added().geojson).toEqual(applyBoundaryDetail(island, 'light'));
  });

  it('prefills the flag code from the picked result and leaves the fill mode alone', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    expect(added().style).toMatchObject({ flagCode: 'it', fillMode: 'color' });
  });

  const toggle = (label: string) => {
    fireEvent.click(screen.getByText(label).parentElement!.parentElement!.querySelector('[role="switch"]')!);
  };

  it('creates the boundary with a flag fill and dimmed surroundings from the switches', () => {
    open();
    toggle('Flag');
    toggle('Dim surroundings');
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    expect(added().style).toMatchObject({ fillMode: 'flag', flagCode: 'it', fillOpacity: 1, maskOutside: true, maskOpacity: 0.7 });
  });

  it('puts the fill opacity back when Flag is turned off again', () => {
    open();
    toggle('Flag');
    toggle('Flag');
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    expect(added().style).toMatchObject({ fillMode: 'color', fillOpacity: 0.1 });
  });

  it('adds a Map Label at the visual centre in the same undo step when Name label is on', () => {
    open();
    toggle('Name label');
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    const callout = Object.values(useProjectStore.getState().items).find((i) => i.kind === 'callout');
    expect(callout).toMatchObject({ styleId: 'map-label', content: { title: 'Isola' }, startTime: added().startTime, endTime: added().endTime });
    undo();
    expect(Object.values(useProjectStore.getState().items).filter((i) => i.kind !== 'camera')).toHaveLength(0);
  });

  it('adds no label by default, and offers Flag only for a country', () => {
    open();
    expect(screen.getByText('Flag')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /insert boundary/i }));
    expect(Object.values(useProjectStore.getState().items).some((i) => i.kind === 'callout')).toBe(false);
    fireEvent.click(screen.getByText('pick-city'));
    expect(screen.queryByText('Flag')).not.toBeInTheDocument();
  });

  it('remembers the last choice for the session', () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: /detailed/i }));
    expect(useProjectStore.getState().boundaryDetail).toBe('detailed');
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

  it('fits the map to the picked place, clear of the panels', () => {
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

