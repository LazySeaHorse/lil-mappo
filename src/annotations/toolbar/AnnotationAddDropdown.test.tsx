import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl/mapbox';
import { MapRefContext } from '@/hooks/useMapRef';
import { useProjectStore } from '@/store/useProjectStore';
import '@/annotations/styles/index';
import { AnnotationAddDropdown } from './AnnotationAddDropdown';

vi.mock('react-secure-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
}));

const easeTo = vi.fn();
let projected = { x: 5000, y: 400 };
const map = {
  getContainer: () => ({ clientWidth: 1200, clientHeight: 800, getBoundingClientRect: () => ({ width: 1200, height: 800 }) }),
  getZoom: () => 4,
  project: () => projected,
  fitBounds: vi.fn(),
  easeTo,
};

function renderDropdown() {
  render(
    <MapRefContext.Provider value={{ current: { getMap: () => map } as unknown as MapRef }}>
      <AnnotationAddDropdown isOpen onOpenChange={vi.fn()} />
    </MapRefContext.Provider>,
  );
  fireEvent.click(screen.getByTitle('Pick on the map'));
  act(() => { useProjectStore.getState().activePicker!.onPick({ lngLat: [2.35, 48.85], name: 'Paris' }); });
  act(() => { fireEvent.click(screen.getByRole('button', { name: /Create callout/i })); });
}

describe('AnnotationAddDropdown map framing', () => {
  beforeEach(() => {
    easeTo.mockClear();
    projected = { x: 5000, y: 400 };
    useProjectStore.setState({
      items: {}, itemOrder: [], selectedItemId: null, activePicker: null, playheadTime: 0,
      isPlaying: false, isExporting: false, isScrubbing: false,
    });
  });

  it('moves the map to a new callout that is off screen', () => {
    renderDropdown();
    expect(Object.values(useProjectStore.getState().items).some((i) => i.kind === 'callout')).toBe(true);
    expect(easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [2.35, 48.85] }));
  });

  it('keeps the place name of the location', () => {
    renderDropdown();
    const callout = Object.values(useProjectStore.getState().items).find((i) => i.kind === 'callout');
    expect(callout).toMatchObject({ locationName: 'Paris' });
  });

  it('leaves the map alone when the callout is already well in view', () => {
    projected = { x: 500, y: 350 };
    renderDropdown();
    expect(easeTo).not.toHaveBeenCalled();
  });
});
