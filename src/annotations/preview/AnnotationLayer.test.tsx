import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@/annotations/styles';
import { registerTestStyles, TEST_CARD_STYLE_ID } from '@/annotations/testStyles';
import { AnnotationLayer } from './AnnotationLayer';
import { AnnotationOverlay } from './AnnotationOverlay';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';

const fakeMap = { id: 'map' };
let mapRef: { getMap: () => unknown } | undefined = { getMap: () => fakeMap };

vi.mock('react-map-gl/mapbox', () => ({
  Marker: ({ children }: { children: React.ReactNode }) => <div data-testid="marker">{children}</div>,
  useMap: () => ({ current: mapRef }),
}));

vi.mock('./AnnotationOverlay', () => ({
  AnnotationOverlay: vi.fn(function () {
    return { mount: vi.fn(), dispose: vi.fn() };
  }),
}));

registerTestStyles();

function makeCallout(overrides: Partial<CalloutItem> = {}): CalloutItem {
  return {
    id: 'c1',
    kind: 'callout',
    styleId: TEST_CARD_STYLE_ID,
    styleVersion: 1,
    content: { title: 'Harbour' },
    binding: { kind: 'geographic', lngLat: [10, 20], altitude: 40 },
    offset: [0, 0],
    anchor: 'bottom',
    startTime: 0,
    endTime: 10,
    transition: { enter: 'fade', exit: 'fade', enterDuration: 1, exitDuration: 1 },
    connector: { visible: true, style: 'solid', color: '#fff', width: 2, endDot: true, endDotRadius: 3 },
    opacity: 1,
    scale: 1,
    sizeMode: 'screen',
    referenceZoom: 12,
    settings: {},
    linkTitleToLocation: false,
    ...overrides,
  };
}

describe('AnnotationLayer', () => {
  beforeEach(() => {
    vi.mocked(AnnotationOverlay).mockClear();
    mapRef = { getMap: () => fakeMap };
    const callout = makeCallout();
    useProjectStore.setState({
      items: { c1: callout },
      itemOrder: ['c1'],
      selectedItemId: 'c1',
      isMoveModeActive: false,
    });
  });

  it('mounts one overlay on the map, and disposes it on unmount', () => {
    const { unmount } = render(<AnnotationLayer />);
    expect(AnnotationOverlay).toHaveBeenCalledTimes(1);
    expect(AnnotationOverlay).toHaveBeenCalledWith(fakeMap);
    const overlay = vi.mocked(AnnotationOverlay).mock.results[0].value as { mount: () => void; dispose: () => void };
    expect(overlay.mount).toHaveBeenCalledTimes(1);
    unmount();
    expect(overlay.dispose).toHaveBeenCalledTimes(1);
  });

  it('does not recreate the overlay when the project changes', () => {
    render(<AnnotationLayer />);
    useProjectStore.setState({ playheadTime: 3 });
    useProjectStore.setState({ items: { c1: makeCallout({ content: { title: 'Edited' } }) } });
    expect(AnnotationOverlay).toHaveBeenCalledTimes(1);
  });

  it('waits for the map', () => {
    mapRef = undefined;
    render(<AnnotationLayer />);
    expect(AnnotationOverlay).not.toHaveBeenCalled();
  });

  it('shows a drag handle for the selected callout only in move mode', () => {
    const { rerender } = render(<AnnotationLayer />);
    expect(screen.queryByTestId('marker')).toBeNull();

    useProjectStore.setState({ isMoveModeActive: true });
    rerender(<AnnotationLayer />);
    expect(screen.getByTestId('marker')).toBeTruthy();
  });

  it('shows no drag handle for an unplaced callout', () => {
    useProjectStore.setState({
      items: { c1: makeCallout({ binding: { kind: 'geographic', lngLat: [0, 0], altitude: 0 } }) },
      isMoveModeActive: true,
    });
    render(<AnnotationLayer />);
    expect(screen.queryByTestId('marker')).toBeNull();
  });
});
