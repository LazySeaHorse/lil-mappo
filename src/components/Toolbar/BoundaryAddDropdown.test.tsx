import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoundaryAddDropdown } from './BoundaryAddDropdown';
import { PreviewBoundaryLayer } from '@/components/MapViewport/PreviewBoundaryLayer';
import { useProjectStore } from '@/store/useProjectStore';
import { applyBoundaryDetail } from '@/engine/boundaryDetail';
import { syntheticIsland } from '@/test/syntheticGeometry';
import type { BoundaryItem } from '@/store/types';

const island = syntheticIsland();

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));

vi.mock('../Inspector/BoundarySearch', () => ({
  BoundarySearch: ({ onSelect }: { onSelect: (r: unknown) => void }) => (
    <button onClick={() => onSelect({ display_name: 'Isola, Italia', type: 'island', geojson: island })}>pick-result</button>
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

  it('remembers the last choice for the session', () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: /detailed/i }));
    expect(useProjectStore.getState().boundaryDetail).toBe('detailed');
  });
});
