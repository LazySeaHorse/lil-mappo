import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteInspector } from './RouteInspector';
import { BoundaryInspector } from './BoundaryInspector';
import { AnnotationInspector } from '@/annotations/inspector/AnnotationInspector';
import { CameraKFInspector } from './CameraKFInspector';
import { useProjectStore } from '@/store/useProjectStore';
import '@/annotations/styles/index';
import { registerTestStyles, TEST_FLAT_STYLE_ID } from '@/annotations/testStyles';
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

function makeInspectorCallout(overrides: Partial<CalloutItem> = {}): CalloutItem {
  return {
    id: 'callout-anim',
    kind: 'callout',
    styleId: 'leader-line',
    styleVersion: 1,
    content: { title: 'Pier' },
    binding: { kind: 'geographic', lngLat: [10, 20], altitude: 0 },
    offset: [70, -90],
    anchor: 'bottom',
    startTime: 0,
    endTime: 5,
    transition: { enter: 'fade', exit: 'fade', enterDuration: 0.4, exitDuration: 0.3 },
    connector: { visible: false, style: 'dashed', color: '#94a3b8', width: 2, endDot: true, endDotRadius: 3 },
    opacity: 1,
    scale: 1,
    sizeMode: 'screen',
    referenceZoom: 12,
    settings: {},
    linkTitleToLocation: false,
    ...overrides,
  };
}

registerTestStyles();

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

  it('renders AnnotationInspector with style controls, location and animation', () => {
    const calloutItem: CalloutItem = {
      id: 'callout-1',
      kind: 'callout',
      styleId: 'leader-line',
      styleVersion: 1,
      content: {
        title: 'Golden Gate Bridge',
      },
      binding: {
        kind: 'geographic',
        lngLat: [-122.4783, 37.8199],
        altitude: 100,
      },
      offset: [70, -90],
      anchor: 'bottom',
      startTime: 2,
      endTime: 6,
      linkTitleToLocation: false,
      transition: {
        enter: 'fade',
        exit: 'fade',
        enterDuration: 0.5,
        exitDuration: 0.5,
      },
      connector: {
        visible: true,
        style: 'dashed',
        color: '#ffffff',
        width: 2,
        endDot: true,
        endDotRadius: 3,
      },
      opacity: 1,
      scale: 1,
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: {
        lineColor: '#ffffff',
        accentColor: '#ff5a36',
        textColor: '#ffffff',
        halo: true,
        side: 'auto',
        lineWidth: 1.5,
        pulse: false,
      },
    };

    useProjectStore.setState({
      items: { 'callout-1': calloutItem },
      selectedItemId: 'callout-1',
    });

    render(<AnnotationInspector item={calloutItem} />);

    expect(screen.getByDisplayValue('Golden Gate Bridge')).toBeInTheDocument();
    expect(screen.getByText('Line color')).toBeInTheDocument();
    expect(screen.getByText('Dot color')).toBeInTheDocument();
    expect(screen.getByText('Soft shadow')).toBeInTheDocument();
    expect(screen.queryByText('Font')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Longitude')).toHaveValue(-122.4783);
    expect(screen.getByLabelText('Latitude')).toHaveValue(37.8199);
    expect(screen.getByText('Altitude')).toBeInTheDocument();
    expect(screen.getByText('100 px')).toBeInTheDocument();
    // Leader lines draw their own line to the ground, so there is no generic anchor line to style.
    expect(screen.queryByText('Anchor line')).not.toBeInTheDocument();
  });

  it('offers the style animation as a transition, alongside the block transitions', () => {
    const item = makeInspectorCallout({ transition: { enter: 'auto', exit: 'auto', enterDuration: 1.2, exitDuration: 0.5 } });
    useProjectStore.setState({ items: { [item.id]: item }, selectedItemId: item.id });
    render(<AnnotationInspector item={item} />);

    expect(screen.getByText('Animation')).toBeInTheDocument();
    expect(screen.getAllByText('Style animation')).toHaveLength(2); // enter and exit
    expect(screen.getByText('1.2 s')).toBeInTheDocument();
    expect(screen.getByText('0.5 s')).toBeInTheDocument();
  });

  it('hides Altitude slider and Anchor line section for a ground-level style', () => {
    const rippleItem: CalloutItem = {
      id: 'ripple-1',
      kind: 'callout',
      styleId: TEST_FLAT_STYLE_ID,
      styleVersion: 1,
      content: {
        title: 'Sonar Ping',
      },
      binding: {
        kind: 'geographic',
        lngLat: [12.4924, 41.8902],
        altitude: 0,
      },
      offset: [0, 0],
      anchor: 'center',
      startTime: 1,
      endTime: 5,
      linkTitleToLocation: false,
      transition: {
        enter: 'fade',
        exit: 'fade',
        enterDuration: 0.3,
        exitDuration: 0.3,
      },
      connector: {
        visible: false,
        style: 'dashed',
        color: '#94a3b8',
        width: 2,
        endDot: true,
        endDotRadius: 3,
      },
      opacity: 1,
      scale: 1,
      sizeMode: 'screen',
      referenceZoom: 12,
      settings: { color: '#3b82f6' },
    };

    useProjectStore.setState({
      items: { 'ripple-1': rippleItem },
      selectedItemId: 'ripple-1',
    });

    render(<AnnotationInspector item={rippleItem} />);

    expect(screen.getByDisplayValue('Sonar Ping')).toBeInTheDocument();
    expect(screen.queryByText('Altitude')).not.toBeInTheDocument();
    expect(screen.queryByText('Anchor line')).not.toBeInTheDocument();
    expect(screen.queryByText('Show anchor line')).not.toBeInTheDocument();
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
