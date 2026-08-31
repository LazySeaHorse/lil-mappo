import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteInspector } from './RouteInspector';
import { BoundaryInspector } from './BoundaryInspector';
import { CalloutInspector } from './CalloutInspector';
import { CameraKFInspector } from './CameraKFInspector';
import { useProjectStore } from '@/store/useProjectStore';
import type { RouteItem, BoundaryItem, CalloutItem, CameraItem } from '@/store/types';

vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({
    data: { tier: 'cartographer' },
  }),
}));

vi.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isMobile: false, isTablet: false }),
}));

vi.mock('./RoutePlanner', () => ({
  RoutePlanner: () => <div data-testid="route-planner-mock">RoutePlanner Mock</div>,
}));

vi.mock('./BoundarySearch', () => ({
  BoundarySearch: () => <div data-testid="boundary-search-mock">BoundarySearch Mock</div>,
}));

vi.mock('../Search/SearchField', () => ({
  SearchField: () => <div data-testid="search-field-mock">SearchField Mock</div>,
}));

describe('Inspector Components Integration', () => {
  beforeEach(() => {
    useProjectStore.setState({
      items: {},
      itemOrder: [],
      selectedItemId: null,
      selectedKeyframeId: null,
    });
  });

  it('renders RouteInspector and modifies appearance & timing properties', () => {
    const routeItem: RouteItem = {
      id: 'route-1',
      kind: 'route',
      name: 'Highway Drive',
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
            properties: {},
          },
        ],
      },
      startTime: 1,
      endTime: 5,
      easing: 'easeInOutSine',
      style: {
        color: '#ff0000',
        width: 4,
        glow: false,
        glowColor: '#ffff00',
        glowWidth: 8,
        trailFade: false,
        trailFadeLength: 0.2,
        dashPattern: null,
        animationType: 'draw',
      },
      calculation: {
        mode: 'car',
        startPoint: [0, 0],
        endPoint: [1, 1],
        vehicle: {
          enabled: true,
          type: 'car',
          modelId: '',
          scale: 1.5,
        },
      },
    };

    useProjectStore.setState({
      items: { 'route-1': routeItem },
      selectedItemId: 'route-1',
    });

    render(<RouteInspector item={routeItem} />);

    expect(screen.getByDisplayValue('Highway Drive')).toBeInTheDocument();
    expect(screen.getByText('Route marker')).toBeInTheDocument();
    expect(screen.getByText('1.5x')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time')).toHaveValue(1);
    expect(screen.getByLabelText('Duration')).toHaveValue(4);
  });

  it('renders BoundaryInspector and updates styling & timing', () => {
    const boundaryItem: BoundaryItem = {
      id: 'boundary-1',
      kind: 'boundary',
      placeName: 'California',
      geojson: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
      },
      startTime: 0,
      endTime: 4,
      easing: 'easeInOutSine',
      resolveStatus: 'resolved',
      style: {
        strokeColor: '#00ff00',
        fillColor: '#003300',
        strokeWidth: 3,
        glow: true,
        fillOpacity: 0.5,
        animateStroke: false,
        animationStyle: 'trace',
        traceLength: 0.2,
      },
    };

    useProjectStore.setState({
      items: { 'boundary-1': boundaryItem },
      selectedItemId: 'boundary-1',
    });

    render(<BoundaryInspector item={boundaryItem} />);

    expect(screen.getByDisplayValue('California')).toBeInTheDocument();
    expect(screen.getByText('Stroke color')).toBeInTheDocument();
    expect(screen.getByText('Line width')).toBeInTheDocument();
    expect(screen.getByText('Fill opacity')).toBeInTheDocument();
    expect(screen.getByText('50 %')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time')).toHaveValue(0);
    expect(screen.getByLabelText('Duration')).toHaveValue(4);
  });

  it('renders CalloutInspector and updates location, font & timing', () => {
    const calloutItem: CalloutItem = {
      id: 'callout-1',
      kind: 'callout',
      title: 'Golden Gate Bridge',
      subtitle: '',
      imageUrl: null,
      lngLat: [-122.4783, 37.8199],
      anchor: 'bottom',
      altitude: 100,
      poleVisible: true,
      poleColor: '#ffffff',
      startTime: 2,
      endTime: 6,
      linkTitleToLocation: false,
      animation: {
        enter: 'fadeIn',
        exit: 'fadeOut',
        enterDuration: 0.5,
        exitDuration: 0.5,
      },
      style: {
        variant: 'modern',
        fontFamily: 'Inter',
        bgColor: '#1e1e1e',
        textColor: '#ffffff',
        accentColor: '#3b82f6',
        borderRadius: 8,
        shadow: true,
        maxWidth: 200,
        showMetadata: false,
      },
    };

    useProjectStore.setState({
      items: { 'callout-1': calloutItem },
      selectedItemId: 'callout-1',
    });

    render(<CalloutInspector item={calloutItem} />);

    expect(screen.getByDisplayValue('Golden Gate Bridge')).toBeInTheDocument();
    expect(screen.getByText('Font')).toBeInTheDocument();
    expect(screen.getByText('Background color')).toBeInTheDocument();
    expect(screen.getByText('Card width')).toBeInTheDocument();
    expect(screen.getByLabelText('Longitude')).toHaveValue(-122.4783);
    expect(screen.getByLabelText('Latitude')).toHaveValue(37.8199);
  });

  it('renders CameraKFInspector and displays keyframe details', () => {
    const cameraItem: CameraItem = {
      id: 'camera',
      kind: 'camera',
      keyframes: [
        {
          id: 'kf-1',
          time: 2.5,
          camera: {
            center: [-122.4, 37.8],
            zoom: 12,
            pitch: 45,
            bearing: 90,
            altitude: null,
          },
          easing: 'easeInOutSine',
          followRoute: null,
        },
      ],
    };

    useProjectStore.setState({
      items: { camera: cameraItem },
      selectedItemId: 'camera',
      selectedKeyframeId: 'kf-1',
    });

    render(<CameraKFInspector item={cameraItem} />);

    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2.5')).toBeInTheDocument();
    expect(screen.getByText('Zoom')).toBeInTheDocument();
    expect(screen.getByText('45.0°')).toBeInTheDocument();
    expect(screen.getByText('90.0°')).toBeInTheDocument();
  });
});
