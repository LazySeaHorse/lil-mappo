import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setVehicleModelLoading } from '@/models/vehicleLoading';
import { RouteMarkerSection } from './RouteMarkerSection';

vi.mock('@/hooks/useSubscription', () => ({ useSubscription: () => ({ data: { tier: 'wanderer', status: 'active' } }) }));

const marker = (type: 'dot' | 'car' | 'plane') => ({ enabled: true, type, modelId: '', scale: 1 });

function section(type: 'dot' | 'car' | 'plane', routeId = 'r1') {
  return <RouteMarkerSection routeId={routeId} vehicle={marker(type)} isPro onChange={() => {}} onLockedSelect={() => {}} />;
}

const spinning = (name: RegExp) => screen.getByRole('button', { name }).querySelector('.animate-spin') !== null;

afterEach(() => act(() => setVehicleModelLoading('r1', false)));

describe('route marker tiles while the model loads', () => {
  it('swaps the chosen Car tile icon for a spinner, and back once loaded', () => {
    render(section('car'));
    expect(spinning(/Car/)).toBe(false);
    act(() => setVehicleModelLoading('r1', true));
    expect(spinning(/Car/)).toBe(true);
    expect(spinning(/Plane/)).toBe(false);
    act(() => setVehicleModelLoading('r1', false));
    expect(spinning(/Car/)).toBe(false);
  });

  it('spins the Plane tile for a plane marker', () => {
    render(section('plane'));
    act(() => setVehicleModelLoading('r1', true));
    expect(spinning(/Plane/)).toBe(true);
    expect(spinning(/Car/)).toBe(false);
  });

  it('shows no spinner on a dot, or for another route loading', () => {
    const { rerender } = render(section('dot'));
    act(() => setVehicleModelLoading('r1', true));
    expect(document.querySelector('.animate-spin')).toBeNull();
    rerender(section('car', 'r2'));
    expect(document.querySelector('.animate-spin')).toBeNull();
  });
});
