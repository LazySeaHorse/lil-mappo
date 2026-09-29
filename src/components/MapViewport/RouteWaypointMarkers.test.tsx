import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteWaypointMarkers } from './RouteWaypointMarkers';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem } from '@/store/types';

interface MockMarkerProps {
  children: React.ReactNode;
  longitude: number;
  latitude: number;
  onDragEnd?: (e: { lngLat: { lng: number; lat: number } }) => void;
}

vi.mock('react-map-gl/mapbox', () => ({
  Marker: ({ children, longitude, latitude, onDragEnd }: MockMarkerProps) => (
    <div
      data-testid="map-marker"
      data-lng={longitude}
      data-lat={latitude}
      onClick={() => onDragEnd?.({ lngLat: { lng: longitude + 0.01, lat: latitude + 0.01 } })}
    >
      {children}
    </div>
  ),
}));

describe('RouteWaypointMarkers', () => {
  const createTestRoute = (mode: 'walk' | 'car' = 'walk'): RouteItem => ({
    id: 'test-route-freeform',
    kind: 'route',
    name: 'Walk Trail',
    startTime: 0,
    endTime: 10,
    geojson: {
      type: 'FeatureCollection',
      features: [],
    },
    style: {
      color: '#3b82f6',
      width: 4,
      glow: true,
      glowColor: '#3b82f6',
      glowWidth: 12,
      trailFade: false,
      trailFadeLength: 0.3,
      dashPattern: null,
      animationType: 'draw',
      cometTrailLength: 0.2,
    },
    calculation: mode === 'walk'
      ? { mode: 'walk', points: [[-73.98, 40.75], [-73.97, 40.76], [-73.96, 40.78]], curved: true, sharpness: 0.85 }
      : { mode: 'car', startPoint: [-73.98, 40.75], endPoint: [-73.96, 40.78] },
    easing: 'easeInOutQuad',
  });

  beforeEach(() => {
    useProjectStore.setState({
      items: {},
      itemOrder: [],
      selectedItemId: null,
    });
  });

  it('renders nothing when no item is selected', () => {
    const { container } = render(<RouteWaypointMarkers />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for car routes', () => {
    const route = createTestRoute('car');
    useProjectStore.setState({ items: { [route.id]: route }, selectedItemId: route.id });
    const { container } = render(<RouteWaypointMarkers />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one marker per walk point, numbered like the inspector list', () => {
    const route = createTestRoute();
    useProjectStore.setState({
      items: { [route.id]: route },
      selectedItemId: route.id,
    });

    render(<RouteWaypointMarkers />);

    const markers = screen.getAllByTestId('map-marker');
    expect(markers.length).toBe(3);
    expect(markers.map((m) => m.textContent)).toEqual(['1', '2', '3']);
  });

  it('updates route coordinates and re-curves geometry when a marker is dragged', () => {
    const route = createTestRoute();
    useProjectStore.setState({
      items: { [route.id]: route },
      selectedItemId: route.id,
    });

    render(<RouteWaypointMarkers />);

    const markers = screen.getAllByTestId('map-marker');
    // Click the intermediate waypoint (index 1) to trigger our mock onDragEnd
    act(() => {
      fireEvent.click(markers[1]);
    });

    const updatedRoute = useProjectStore.getState().items[route.id] as RouteItem;
    const points = updatedRoute.calculation?.mode === 'walk' ? updatedRoute.calculation.points : [];
    expect(points[1][0]).toBeCloseTo(-73.96, 2);
    expect(points[1][1]).toBeCloseTo(40.77, 2);

    // Verify geojson feature collection was recomputed
    expect(updatedRoute.geojson.features.length).toBe(1);
    expect(updatedRoute.geojson.features[0].geometry.type).toBe('LineString');
    const coords = (updatedRoute.geojson.features[0].geometry as GeoJSON.LineString).coordinates;
    expect(coords.length).toBeGreaterThan(3);
  });
});
