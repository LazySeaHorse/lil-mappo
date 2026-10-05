import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLoadGate } from './MapLoadGate';

const mocks = vi.hoisted(() => ({ openAuthModal: vi.fn(), openUpgradeModal: vi.fn() }));

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: () => ({ openAuthModal: mocks.openAuthModal, openUpgradeModal: mocks.openUpgradeModal }),
}));

const blocked = (reason: string) =>
  ({ ready: true, blocked: true, reason, guestLoadsUsed: 3 }) as unknown as Parameters<typeof MapLoadGate>[0]['gate'];

describe('<MapLoadGate />', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a napping Mappo to guests, without mentioning the load cap, and opens sign-in', () => {
    const { container } = render(<MapLoadGate gate={blocked('guest_limit')}><div>map</div></MapLoadGate>);
    expect(screen.getByText('Mappo is napping')).toBeTruthy();
    expect(screen.getByText('Sign in to wake them up.')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b3\b/);
    expect(container.querySelector('svg')?.getAttribute('data-mood')).toBe('sleepy');
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mocks.openAuthModal).toHaveBeenCalled();
  });

  it.each(['daily_throttled', 'monthly_exhausted'])('%s Upgrade opens the upgrade modal, not sign-in', (reason) => {
    render(<MapLoadGate gate={blocked(reason)}><div>map</div></MapLoadGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(mocks.openUpgradeModal).toHaveBeenCalled();
    expect(mocks.openAuthModal).not.toHaveBeenCalled();
  });

  it('renders the map when not blocked', () => {
    render(<MapLoadGate gate={{ ready: true, blocked: false } as never}><div>map</div></MapLoadGate>);
    expect(screen.getByText('map')).toBeTruthy();
  });
});
