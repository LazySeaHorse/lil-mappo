import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteInspector } from './RouteInspector';
import { INSPECTOR_SECTIONS } from './inspectorSections';
import { useProjectStore } from '@/store/useProjectStore';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import { ROUTE_ANIMATION_TERMS } from '@/lib/terms';
import type { RouteItem } from '@/store/types';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('./RoutePathSection', () => ({ RoutePathSection: () => <div /> }));

const makeRoute = (): RouteItem => createEndpointRouteItem({
  id: 'r1', mode: 'car', name: 'Drive', startTime: 0,
  geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }), start: [0, 0], end: [1, 1],
});

const region = (title: string) => screen.getByRole('region', { name: title });
const stored = () => useProjectStore.getState().items.r1 as RouteItem;

const LiveInspector = () => {
  const item = useProjectStore((st) => st.items.r1) as RouteItem;
  return <RouteInspector item={item} />;
};

function show(patch: (route: RouteItem) => void = () => {}) {
  const route = makeRoute();
  patch(route);
  useProjectStore.setState({ items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1' });
  return render(<LiveInspector />);
}

describe('route style sections', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ items: {}, itemOrder: [] });
  });

  it('are registered in order, all open at first', () => {
    expect(INSPECTOR_SECTIONS.route.map((s) => [s.id, s.title])).toEqual([
      ['path', 'Path'],
      ['line', 'Line'],
      ['animation', 'Animation'],
      ['marker', 'Marker'],
      ['timing', 'Timing'],
      ['camera', 'Camera'],
    ]);
    expect(INSPECTOR_SECTIONS.route.every((s) => s.defaultOpen)).toBe(true);
  });

  it('Line holds color, width, line style and glow', () => {
    show();
    const line = within(region('Line'));
    expect(line.getByText('Color')).toBeInTheDocument();
    expect(line.getByText('Width')).toBeInTheDocument();
    expect(line.getByText('Line style')).toBeInTheDocument();
    for (const name of ['Solid', 'Dashed', 'Dotted']) expect(line.getByRole('button', { name })).toBeInTheDocument();
    expect(line.getByText('Glow')).toBeInTheDocument();
    expect(line.getByText('Glow width')).toBeInTheDocument();
    // Nothing of the other sections.
    expect(line.queryByText('Route marker')).not.toBeInTheDocument();
    expect(line.queryByRole('button', { name: /Draw/ })).not.toBeInTheDocument();
  });

  it('Line hides the glow width while glow is off', () => {
    show((r) => { r.style.glow = false; });
    expect(within(region('Line')).queryByText('Glow width')).not.toBeInTheDocument();
  });

  it('Line changes the style of the route', () => {
    show();
    fireEvent.click(within(region('Line')).getByRole('button', { name: 'Dashed' }));
    expect(stored().style.dashPattern).toEqual([8, 4]);
  });

  it('Animation holds the animation choice with a preview in each card', () => {
    const { container } = show();
    const animation = within(region('Animation'));
    for (const key of ['draw', 'navigation', 'comet'] as const) {
      expect(animation.getByRole('button', { name: new RegExp(ROUTE_ANIMATION_TERMS[key].label) })).toBeInTheDocument();
    }
    expect(region('Animation').querySelectorAll('svg[data-preview]')).toHaveLength(3);
    expect(container.querySelectorAll('svg[data-preview]')).toHaveLength(3);
    expect(animation.queryByText('Color')).not.toBeInTheDocument();
    expect(animation.queryByText('Route marker')).not.toBeInTheDocument();
  });

  it('Animation changes the type and says what it does', () => {
    show();
    const animation = within(region('Animation'));
    expect(animation.getByText(ROUTE_ANIMATION_TERMS.draw.hint)).toBeInTheDocument();
    fireEvent.click(animation.getByRole('button', { name: new RegExp(ROUTE_ANIMATION_TERMS.comet.label) }));
    expect(stored().style.animationType).toBe('comet');
    expect(animation.getByText(ROUTE_ANIMATION_TERMS.comet.hint)).toBeInTheDocument();
  });

  it('Animation shows the options of the chosen type only', () => {
    show();
    expect(within(region('Animation')).queryByText('Fade trail')).not.toBeInTheDocument();
    expect(within(region('Animation')).queryByText('Fade length')).not.toBeInTheDocument();
    expect(within(region('Animation')).queryByText('Trail length')).not.toBeInTheDocument();
    fireEvent.click(within(region('Animation')).getByRole('button', { name: new RegExp(ROUTE_ANIMATION_TERMS.comet.label) }));
    expect(within(region('Animation')).getByText('Trail length')).toBeInTheDocument();
    expect(within(region('Animation')).queryByText('Fade trail')).not.toBeInTheDocument();
  });

  it('Marker holds the marker switch, type and size', () => {
    show();
    const marker = within(region('Marker'));
    expect(marker.getByText('Route marker')).toBeInTheDocument();
    for (const name of ['Dot', 'Car', 'Plane']) expect(marker.getByRole('button', { name })).toBeInTheDocument();
    expect(marker.getByText('Size')).toBeInTheDocument();
    expect(marker.queryByText('Glow')).not.toBeInTheDocument();
  });

  it('Marker hides its options while the marker is off, and changes the marker type', () => {
    show((r) => { if (r.calculation) r.calculation.vehicle = { ...r.calculation.vehicle!, enabled: false }; });
    expect(within(region('Marker')).queryByText('Marker type')).not.toBeInTheDocument();
    expect(within(region('Marker')).queryByText('Size')).not.toBeInTheDocument();
  });

  it('Marker type change goes through the store', () => {
    show();
    fireEvent.click(within(region('Marker')).getByRole('button', { name: 'Car' }));
    expect(stored().calculation?.vehicle?.type).toBe('car');
  });
});
