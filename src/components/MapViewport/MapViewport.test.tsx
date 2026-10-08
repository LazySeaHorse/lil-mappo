import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/useProjectStore';
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
});
