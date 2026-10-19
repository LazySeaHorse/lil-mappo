import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { AccountSettingsModal } from './AccountSettingsModal';

const subscriptionMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: subscriptionMock.current, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useCredits', () => ({ useCredits: () => ({ data: null }) }));

function wanderer(overrides: Partial<Subscription> = {}): Subscription {
  return {
    user_id: 'user-1',
    tier: 'wanderer',
    monthly_credits: 100,
    parallel_renders: 1,
    renewal_date: '2026-11-18',
    dodo_subscription_id: 'sub-1',
    status: 'active',
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    ...overrides,
  };
}

function passOnly(end: string): Subscription {
  return wanderer({ status: 'none', renewal_date: null, dodo_subscription_id: null, pass_expires_at: end });
}

function renderWith(subscription: Subscription | null) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
  subscriptionMock.current = subscription;
  const openUpgradeModal = vi.fn();
  useAuthStore.setState({
    showSettingsModal: true,
    user: { id: 'user-1', email: 'me@example.com' },
    openUpgradeModal,
  });
  render(<AccountSettingsModal />);
  return { openUpgradeModal };
}

describe('AccountSettingsModal plan', () => {
  afterEach(() => {
    subscriptionMock.current = null;
    vi.useRealTimers();
  });

  it('shows an active Pro pass with its end, not a subscription to manage', () => {
    const { openUpgradeModal } = renderWith(passOnly('2026-10-21T15:00:00Z'));

    expect(screen.getByText('Pro pass')).toBeInTheDocument();
    expect(screen.getByText(/Ends Oct 21/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument();
    expect(screen.queryByText('Upgrade to Wanderer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(openUpgradeModal).toHaveBeenCalledWith('account_settings');
  });

  it('goes back to the upgrade card once the pass has ended', () => {
    renderWith(passOnly('2026-10-18T14:59:59Z'));

    expect(screen.queryByText('Pro pass')).not.toBeInTheDocument();
    expect(screen.getByText('Upgrade to Wanderer')).toBeInTheDocument();
  });

  it('shows a subscription as before', () => {
    renderWith(wanderer());

    expect(screen.getByText('Wanderer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
    expect(screen.queryByText('Pro pass')).not.toBeInTheDocument();
  });

  it('shows a free user the upgrade card', () => {
    renderWith(null);

    expect(screen.getByText('Upgrade to Wanderer')).toBeInTheDocument();
  });
});
