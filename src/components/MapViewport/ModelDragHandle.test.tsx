import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createModelItem } from '@/store/itemFactories';
import type { ModelItem } from '@/store/types';
import { ModelDragHandle } from './ModelDragHandle';

vi.mock('react-map-gl/mapbox', () => ({
  Marker: ({ children, longitude, latitude, onDragEnd }: {
    children: React.ReactNode; longitude: number; latitude: number;
    onDragEnd?: (e: { lngLat: { lng: number; lat: number } }) => void;
  }) => (
    <div data-testid="map-marker" onClick={() => onDragEnd?.({ lngLat: { lng: longitude + 1, lat: latitude + 1 } })}>
      {children}
    </div>
  ),
}));

const item = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [2, 48], startTime: 0 }), id: 'm1' };

beforeEach(() => {
  useProjectStore.setState({ ...createProject(), ...createTransientState(), items: { m1: item }, itemOrder: ['m1'] });
});

describe('ModelDragHandle', () => {
  it('moves the selected model where it is dragged', () => {
    useProjectStore.setState({ selectedItemId: 'm1' });
    render(<ModelDragHandle />);
    fireEvent.click(screen.getByTestId('map-marker'));
    expect((useProjectStore.getState().items.m1 as ModelItem).position).toEqual([3, 49]);
  });

  it('is not there without a selected model or while playing', () => {
    const { rerender } = render(<ModelDragHandle />);
    expect(screen.queryByTestId('map-marker')).not.toBeInTheDocument();
    useProjectStore.setState({ selectedItemId: 'm1', isPlaying: true });
    rerender(<ModelDragHandle />);
    expect(screen.queryByTestId('map-marker')).not.toBeInTheDocument();
  });
});
