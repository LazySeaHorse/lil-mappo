import { render, screen } from '@testing-library/react';
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

describe('creditsToMinutesAt1080p', () => {
  it('quotes 8 credits per minute of 1080p video', () => {
    expect(creditsToMinutesAt1080p(1000)).toBe(125);
  });
});
