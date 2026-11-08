import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { createProject } from '@/store/projectDocument';
import { createModelItem } from '@/store/itemFactories';
import { EditorMapOverlays } from './EditorMapOverlays';

vi.mock('react-map-gl/mapbox', () => ({
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="map-marker">{children}</div>,
}));

const model = { ...createModelItem({ assetId: 'a1', name: 'Tower', position: [2, 48], startTime: 0 }), id: 'm1' };
const walk = {
  id: 'r1',
  kind: 'route' as const,
  name: 'Walk',
  startTime: 0,
  endTime: 10,
  geojson: { type: 'FeatureCollection' as const, features: [] },
  calculation: { mode: 'walk' as const, points: [[0, 0], [1, 1]] as [number, number][], curved: true, sharpness: 0.85 },
};

beforeEach(() => {
  useProjectStore.setState({
    ...createProject(),
    ...createTransientState(),
    items: { m1: model, r1: walk } as never,
    itemOrder: ['m1', 'r1'],
  });
});

describe('EditorMapOverlays', () => {
  it('shows the selected model handle and walk points while editing', () => {
    useProjectStore.setState({ selectedItemId: 'm1' });
    const { rerender } = render(<EditorMapOverlays />);
    expect(screen.getAllByTestId('map-marker')).toHaveLength(1);
    act(() => useProjectStore.setState({ selectedItemId: 'r1' }));
    rerender(<EditorMapOverlays />);
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2);
  });

  it.each([
    ['zen mode', { hideUI: true }],
    ['playback', { isPlaying: true }],
    ['export', { isExporting: true }],
    ['a viewport capture', { isCapturingViewport: true }],
  ])('shows no handles during %s', (_name, state) => {
    useProjectStore.setState({ selectedItemId: 'r1', ...state });
    const { rerender } = render(<EditorMapOverlays />);
    expect(screen.queryByTestId('map-marker')).not.toBeInTheDocument();
    act(() => useProjectStore.setState({ selectedItemId: 'm1' }));
    rerender(<EditorMapOverlays />);
    expect(screen.queryByTestId('map-marker')).not.toBeInTheDocument();
  });
});
