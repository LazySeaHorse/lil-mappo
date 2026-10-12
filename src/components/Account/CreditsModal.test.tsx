import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import type { AuthUser } from '@/store/useAuthStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CreditsModal } from './CreditsModal';

const subscriptionMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: subscriptionMock.current }),
}));
vi.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({
    data: { user_id: 'user-1', monthly_credits: 100, purchased_credits: 0 },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

function wanderer(overrides: Partial<Subscription> = {}): Subscription {
  return {
    user_id: 'user-1',
    tier: 'wanderer',
    monthly_credits: 100,
    parallel_renders: 1,
    renewal_date: '2026-09-30',
    dodo_subscription_id: 'sub-1',
    status: 'active',
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    ...overrides,
  };
}

/** Opens the "Buy credits" tab, which shows the balance strip for paid-plan users. */
function renderTopUpTab(subscription: Subscription | null) {
  subscriptionMock.current = subscription;
  useAuthStore.setState({
    showCreditsModal: true,
    user: { id: 'user-1', email: 'test@example.com' } as AuthUser,
  });
  render(<CreditsModal />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: /buy credits/i }), { button: 0 });
}

describe('CreditsModal credit balance on the Buy credits tab', () => {
  afterEach(() => {
    subscriptionMock.current = null;
    useAuthStore.setState({ showCreditsModal: false, user: null });
    vi.useRealTimers();
  });

  it('shows the balance to an active Wanderer', () => {
    renderTopUpTab(wanderer());
    expect(screen.getByText('Credits available')).toBeInTheDocument();
  });

  it('shows the balance to a cancelling Wanderer still in the paid period', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    renderTopUpTab(wanderer({ status: 'cancelling' }));
    expect(screen.getByText('Credits available')).toBeInTheDocument();
  });

  it('hides the balance once a cancelled plan has ended', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T00:00:01Z'));
    renderTopUpTab(wanderer({ status: 'cancelling' }));
    expect(screen.getByText('Buy credits', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByText('Credits available')).not.toBeInTheDocument();
  });

  it('hides the balance without a subscription', () => {
    renderTopUpTab(null);
    expect(screen.getByText('Buy credits', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByText('Credits available')).not.toBeInTheDocument();
  });
});
