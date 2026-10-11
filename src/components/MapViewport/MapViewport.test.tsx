import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
import type { CalloutItem } from '@/store/types';
import MapViewport from './MapViewport';

const mapGlRenders = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('react-map-gl/mapbox', () => ({
  default: (props: Record<string, unknown>) => {
    mapGlRenders.push(props);
    return null;
  },
}));

const initialStore = useProjectStore.getState();

function mountViewport() {
  return render(<MapViewport mapRef={{ current: null }} runtimeRef={{ current: null }} mapboxToken="pk.test" />);
}

describe('MapViewport', () => {
  beforeEach(() => {
    useProjectStore.setState(initialStore, true);
    mapGlRenders.length = 0;
  });

  it.each(['mercator', 'globe'] as const)('starts the map in the project projection (%s)', (projection) => {
    useProjectStore.setState({ projection });
    mountViewport();
    expect(mapGlRenders[0]?.projection).toBe(projection);
  });

  it('does not push later projection changes through the prop; the scene controller owns those', () => {
    useProjectStore.setState({ projection: 'mercator' });
    const view = mountViewport();
    useProjectStore.setState({ projection: 'globe' });
    view.rerender(<MapViewport mapRef={{ current: null }} runtimeRef={{ current: null }} mapboxToken="pk.test" />);
    expect(mapGlRenders.length).toBeGreaterThan(1);
    expect(mapGlRenders.map((props) => props.projection)).toEqual(mapGlRenders.map(() => 'mercator'));
  });

  it.each([
    { flags: {}, saved: true },
    { flags: { isExporting: true }, saved: false },
    { flags: { isCapturingViewport: true }, saved: false },
  ])('map moves update mapCenter only outside export and capture ($flags)', ({ flags, saved }) => {
    vi.useFakeTimers();
    try {
      const setMapCenter = vi.fn();
      useProjectStore.setState({ setMapCenter, ...flags });
      mountViewport();
      const onMove = mapGlRenders[0]?.onMove as (e: unknown) => void;
      onMove({ viewState: { longitude: 7, latitude: 8 } });
      vi.advanceTimersByTime(200);
      if (saved) expect(setMapCenter).toHaveBeenCalledWith([7, 8]);
      else expect(setMapCenter).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { lngLat: [0, 0] as [number, number], placed: false },
    { lngLat: [0, 5] as [number, number], placed: true },
    { lngLat: [12, 34] as [number, number], placed: true },
  ])('a map click places the selected callout only while it is unplaced ($lngLat)', ({ lngLat, placed }) => {
    const callout = { kind: 'callout', id: 'c1', binding: { kind: 'geographic', lngLat, altitude: 0 } } as unknown as CalloutItem;
    const updateItem = vi.fn();
    useProjectStore.setState({ items: { c1: callout }, selectedItemId: 'c1', activePicker: null, updateItem });
    mountViewport();
    const onClick = mapGlRenders[0]?.onClick as (e: unknown) => void;
    onClick({ lngLat: { lng: 7, lat: 8 } });
    if (placed) expect(updateItem).not.toHaveBeenCalled();
    else expect(updateItem).toHaveBeenCalledWith('c1', { binding: { kind: 'geographic', lngLat: [7, 8], altitude: 0 } });
  });
});
