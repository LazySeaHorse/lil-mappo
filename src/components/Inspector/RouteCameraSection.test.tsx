import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InspectorPanel from './InspectorPanel';
import { RouteInspector } from './RouteInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { useUiPreferencesStore } from '@/store/useUiPreferencesStore';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { autoCamForRoute, AUTO_CAM_PRESETS } from '@/config/vehicles';
import { FOLLOW_CAMERA_TERMS, ROUTE_TERMS } from '@/lib/terms';
import type { RouteItem } from '@/store/types';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('./RoutePathSection', () => ({ RoutePathSection: () => <div /> }));
vi.mock('@/annotations/inspector/AnnotationInspector', () => ({ AnnotationInspector: () => <div /> }));

const makeRoute = (): RouteItem => createEndpointRouteItem({
  id: 'r1', mode: 'car', name: 'Drive', startTime: 0,
  geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), start: [0, 0], end: [1, 1],
});
const stored = () => useProjectStore.getState().items.r1 as RouteItem;
const cameraRegion = () => screen.getByRole('region', { name: 'Camera' });

function open(followCamera: boolean) {
  const route = makeRoute();
  if (followCamera) route.autoCam = autoCamForRoute(route);
  useProjectStore.setState({
    items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1', selectedAutoCamRouteId: null, isInspectorOpen: true,
  });
  return render(<InspectorPanel />);
}

describe('Follow camera in the route panel', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiPreferencesStore.setState({ inspectorSections: {} });
    useProjectStore.setState({ items: {}, itemOrder: [], selectedItemId: null, selectedAutoCamRouteId: null });
  });

  it('is off at first and shows the switch with a one line hint', () => {
    open(false);
    const region = within(cameraRegion());
    expect(region.getByText(ROUTE_TERMS.followCamera)).toBeInTheDocument();
    expect(region.getByText(FOLLOW_CAMERA_TERMS.hint)).toBeInTheDocument();
    expect(region.getByRole('switch')).toHaveAttribute('data-state', 'unchecked');
    expect(region.queryByRole('button', { name: FOLLOW_CAMERA_TERMS.editCamera })).not.toBeInTheDocument();
    expect(stored().autoCam).toBeUndefined();
  });

  it('shows a summary card with the preset when it is on', () => {
    open(true);
    const region = within(cameraRegion());
    expect(region.getByRole('switch')).toHaveAttribute('data-state', 'checked');
    expect(region.getByText(AUTO_CAM_PRESETS.chase.label)).toBeInTheDocument();
    expect(region.getByText(AUTO_CAM_PRESETS.chase.description)).toBeInTheDocument();
    expect(region.getByRole('button', { name: FOLLOW_CAMERA_TERMS.editCamera })).toBeInTheDocument();
  });

  it('describes the navigation view when that is the mode', () => {
    open(true);
    act(() => { useProjectStore.getState().updateItem('r1', { autoCam: { ...stored().autoCam!, mode: 'navigation' } }); });
    const region = within(cameraRegion());
    expect(region.getByText(FOLLOW_CAMERA_TERMS.navigationView.title)).toBeInTheDocument();
    expect(region.getByText(FOLLOW_CAMERA_TERMS.navigationView.description)).toBeInTheDocument();
  });

  it('Edit camera opens the Follow camera panel and the back link returns to the route', () => {
    open(true);
    fireEvent.click(within(cameraRegion()).getByRole('button', { name: FOLLOW_CAMERA_TERMS.editCamera }));
    expect(useProjectStore.getState().selectedAutoCamRouteId).toBe('r1');
    expect(screen.getByRole('button', { name: /Turn off Follow camera/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Line' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: FOLLOW_CAMERA_TERMS.backToRoute }));
    expect(useProjectStore.getState().selectedAutoCamRouteId).toBeNull();
    expect(useProjectStore.getState().selectedItemId).toBe('r1');
    expect(screen.getByRole('region', { name: 'Line' })).toBeInTheDocument();
  });

  it('turning Follow camera off in the panel keeps the settings and returns to the route', () => {
    open(true);
    fireEvent.click(within(cameraRegion()).getByRole('button', { name: FOLLOW_CAMERA_TERMS.editCamera }));
    fireEvent.click(screen.getByRole('button', { name: /Turn off Follow camera/ }));
    expect(stored().autoCam).toMatchObject({ enabled: false, preset: 'chase' });
    expect(screen.getByRole('region', { name: 'Line' })).toBeInTheDocument();
  });

  it('the route panel alone still renders for a route with Follow camera on', () => {
    const route = { ...makeRoute(), autoCam: autoCamForRoute(makeRoute()) };
    useProjectStore.setState({ items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1' });
    render(<RouteInspector item={route} />);
    expect(screen.getByRole('button', { name: FOLLOW_CAMERA_TERMS.editCamera })).toBeInTheDocument();
  });
});
