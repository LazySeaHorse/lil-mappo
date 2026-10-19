import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@/lib/database.types';
import { useAuthStore } from '@/store/useAuthStore';
import { creditsToMinutesAt1080p } from '@/services/checkout';
import { UpgradeModal } from './UpgradeModal';

const subscriptionMock = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/hooks/useSubscription', () => ({
  useSubscription: () => ({ data: subscriptionMock.current }),
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

describe('UpgradeModal', () => {
  it('shows the free-plan limits', () => {
    useAuthStore.setState({ showUpgradeModal: true });
    render(<UpgradeModal />);

    expect(screen.getByText('3 projects')).toBeInTheDocument();
    expect(screen.getByText('720p, 30 FPS')).toBeInTheDocument();
    expect(screen.getByText('30 seconds')).toBeInTheDocument();
  });
});

describe('UpgradeModal current plan', () => {
  afterEach(() => {
    subscriptionMock.current = null;
    vi.useRealTimers();
  });

  function renderWith(subscription: Subscription | null) {
    subscriptionMock.current = subscription;
    useAuthStore.setState({ showUpgradeModal: true });
    render(<UpgradeModal />);
  }

  it('marks an active Wanderer as the current plan', () => {
    renderWith(wanderer());
    expect(screen.getByRole('button', { name: /current plan/i })).toBeDisabled();
  });

  it('marks a cancelling Wanderer as the current plan until the period ends', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    renderWith(wanderer({ status: 'cancelling' }));
    expect(screen.getByRole('button', { name: /current plan/i })).toBeDisabled();
  });

  it('lets a cancelled Wanderer subscribe again once the period has ended', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T00:00:01Z'));
    renderWith(wanderer({ status: 'cancelling' }));
    expect(screen.getByRole('button', { name: /subscribe to wanderer/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /current plan/i })).not.toBeInTheDocument();
  });
});

describe('UpgradeModal 3-day pass', () => {
  const startCheckout = vi.fn();

  afterEach(() => {
    subscriptionMock.current = null;
    startCheckout.mockReset();
    vi.useRealTimers();
  });

  function renderWith(subscription: Subscription | null) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
    subscriptionMock.current = subscription;
    useAuthStore.setState({ showUpgradeModal: true, startCheckout });
    render(<UpgradeModal />);
  }

  /** What useSubscription returns for a pass with no subscription. */
  function passOnly(end: string): Subscription {
    return wanderer({ status: 'none', renewal_date: null, dodo_subscription_id: null, pass_expires_at: end });
  }

  it('offers monthly and the 3-day pass as two buttons', () => {
    renderWith(null);

    expect(screen.getByRole('button', { name: 'Subscribe to Wanderer, $7/month' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '3-day pass, $3 for 3 days' })).toHaveTextContent('$3 for 3 days');
    expect(screen.getByText(/Monthly renews at \$7 until you cancel/)).toBeInTheDocument();
    expect(screen.getByText(/one payment of \$3 for 3 days/)).toBeInTheDocument();
  });

  it('starts a monthly checkout from the subscribe button', () => {
    renderWith(null);

    fireEvent.click(screen.getByRole('button', { name: /subscribe to wanderer/i }));
    expect(startCheckout).toHaveBeenCalledWith('wanderer');
  });

  it('starts a pass checkout from the pass button', () => {
    renderWith(null);

    fireEvent.click(screen.getByRole('button', { name: '3-day pass, $3 for 3 days' }));
    expect(startCheckout).toHaveBeenCalledWith('pass_3day');
  });

  it('hides both purchase buttons from an active subscriber and shows only Current plan', () => {
    renderWith(wanderer());

    expect(screen.getByRole('button', { name: /current plan/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /subscribe to wanderer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /3-day pass|add 3 days/i })).not.toBeInTheDocument();
  });

  it('shows when an active pass ends, lets the user add days, and still offers the subscription', () => {
    renderWith(passOnly('2026-10-21T15:00:00Z'));

    expect(screen.getByText(/Your pass ends Oct 21/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subscribe to wanderer/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /add 3 days/i }));
    expect(startCheckout).toHaveBeenCalledWith('pass_3day');
  });

  it('offers a new pass once the old one has ended', () => {
    renderWith(passOnly('2026-10-18T14:59:59Z'));

    expect(screen.queryByText(/Your pass ends/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3-day pass, $3 for 3 days' })).toBeEnabled();
  });

  it('has no price block above the plan comparison', () => {
    renderWith(null);

    expect(screen.queryByText('$7')).not.toBeInTheDocument();
    expect(screen.queryByText('/month')).not.toBeInTheDocument();
    expect(screen.queryByText('Limited-time discount')).not.toBeInTheDocument();
  });
});

describe('creditsToMinutesAt1080p', () => {
  it('quotes 8 credits per minute of 1080p video', () => {
    expect(creditsToMinutesAt1080p(1000)).toBe(125);
  });
});
