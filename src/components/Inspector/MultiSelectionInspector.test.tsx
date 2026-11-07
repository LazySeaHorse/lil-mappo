import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CAMERA_TRACK_ID, createTransientState, useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';
import InspectorPanel from './InspectorPanel';

vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));

function route(id: string): RouteItem {
  return {
    kind: 'route', id, name: id, geojson: { type: 'FeatureCollection', features: [] }, startTime: 0, endTime: 2,
    style: { color: '#000000', width: 4, glow: false, glowWidth: 0, dashPattern: null, animationType: 'draw', cometTrailLength: 0.2 },
    easing: 'linear', exitAnimation: 'none',
  };
}

beforeEach(() => {
  useProjectStore.setState({
    ...createTransientState(),
    isInspectorOpen: true,
    items: { [CAMERA_TRACK_ID]: { kind: 'camera', id: CAMERA_TRACK_ID, keyframes: [] }, a: route('a'), b: route('b') },
    itemOrder: [CAMERA_TRACK_ID, 'a', 'b'],
  });
});

describe('the inspector with several items selected', () => {
  it('says how many are selected and offers to ask for editing them together', () => {
    render(<InspectorPanel />);
    act(() => {
      useProjectStore.getState().selectItem('a');
      useProjectStore.getState().toggleItemSelection('b');
    });

    expect(screen.getAllByText('2 items selected').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: "I'd like this, Multi-edit and groups" })).toBeInTheDocument();
  });

  it('goes back to the item itself once only one is selected', () => {
    render(<InspectorPanel />);
    act(() => {
      useProjectStore.getState().selectItem('a');
      useProjectStore.getState().toggleItemSelection('b');
      useProjectStore.getState().toggleItemSelection('b');
    });
    expect(screen.queryByText('2 items selected')).not.toBeInTheDocument();
  });
});
