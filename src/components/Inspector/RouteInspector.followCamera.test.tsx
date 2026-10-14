import React from 'react';
import { fireEvent, render, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteInspector } from './RouteInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import type { RouteItem } from '@/store/types';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: null }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('./RoutePathSection', () => ({ RoutePathSection: () => <div /> }));

const makeRoute = (id: string, coords: number[][], over: Partial<RouteItem> = {}): RouteItem => ({
  ...createEndpointRouteItem({
    id, mode: 'car', geojson: wrapGeometry({ type: 'LineString', coordinates: coords }),
    start: [0, 0], end: [1, 1], name: id, startTime: 0,
  }),
  ...over,
});

const toggle = () => within(document.querySelector('[data-walkthrough="follow-route"]') as HTMLElement).getByRole('switch');

describe('RouteInspector Follow camera switch', () => {
  beforeEach(() => toastError.mockReset());

  it('turns Follow camera on through the store action', () => {
    const route = makeRoute('r1', [[0, 0], [1, 1]]);
    useProjectStore.setState({ items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1' });
    render(<RouteInspector item={route} />);
    fireEvent.click(toggle());
    expect((useProjectStore.getState().items.r1 as RouteItem).autoCam?.enabled).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows the reason as a toast when the rule says no', () => {
    const route = makeRoute('r1', [[0, 0]]);
    useProjectStore.setState({ items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1' });
    render(<RouteInspector item={route} />);
    fireEvent.click(toggle());
    expect(toastError).toHaveBeenCalledWith('Add a route before you turn on Follow camera.');
    expect((useProjectStore.getState().items.r1 as RouteItem).autoCam).toBeUndefined();
  });
});
