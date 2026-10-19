import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteInspector } from './RouteInspector';
import { useProjectStore } from '@/store/useProjectStore';
import { createEndpointRouteItem, wrapGeometry } from '@/store/itemFactories';
import type { Subscription } from '@/lib/database.types';

let subscription: Partial<Subscription> | null = null;
vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: subscription }) }));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: false, isTablet: false }) }));
vi.mock('./RoutePathSection', () => ({ RoutePathSection: () => <div /> }));

const route = createEndpointRouteItem({
  id: 'r1',
  mode: 'car',
  geojson: wrapGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
  start: [0, 0],
  end: [1, 1],
  name: 'Drive',
  startTime: 0,
});

function vehicleBadges(sub: Partial<Subscription> | null) {
  subscription = sub;
  useProjectStore.setState({ items: { r1: route }, itemOrder: ['r1'], selectedItemId: 'r1' });
  render(<RouteInspector item={route} />);
  return screen.queryAllByText('PRO').length;
}

// Car, plane and the custom (imported model) marker each carry a PRO badge when locked.
describe('RouteInspector 3D vehicle access', () => {
  beforeEach(() => useProjectStore.setState({ items: {}, itemOrder: [] }));

  it('unlocks car, plane and custom markers for an active Wanderer plan', () => {
    expect(vehicleBadges({ tier: 'wanderer', status: 'active' })).toBe(0);
  });

  it('locks them for free users', () => {
    expect(vehicleBadges(null)).toBe(3);
  });

  it('locks them when the Wanderer plan is no longer paid', () => {
    expect(vehicleBadges({ tier: 'wanderer', status: 'on_hold' })).toBe(3);
  });

  it('locks them for legacy tiers that no other paid check accepts', () => {
    expect(vehicleBadges({ tier: 'cartographer', status: 'active' })).toBe(3);
  });
});
