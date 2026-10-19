import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';

const mocks = vi.hoisted(() => ({
  initAuth: vi.fn(),
  invalidateQueries: vi.fn(),
  clearCheckoutReturnPlan: vi.fn(),
  getCheckoutReturnPlan: vi.fn(),
  toastSuccess: vi.fn(),
  toastLoading: vi.fn(),
  toastInfo: vi.fn(),
  getQueriesData: vi.fn(),
}));

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { initAuth: typeof mocks.initAuth }) => unknown) =>
    selector({ initAuth: mocks.initAuth }),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: mocks.invalidateQueries, getQueriesData: mocks.getQueriesData },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, loading: mocks.toastLoading, info: mocks.toastInfo },
}));

vi.mock('@/services/checkout', () => ({
  PASS_PLAN: 'pass_3day',
  PLAN_CONFIG: {
    wanderer: { name: 'Wanderer' },
    cartographer: { name: 'Cartographer' },
    pioneer: { name: 'Pioneer' },
  },
  clearCheckoutReturnPlan: mocks.clearCheckoutReturnPlan,
  getCheckoutReturnPlan: mocks.getCheckoutReturnPlan,
  isSuccessfulCheckoutReturn: (params: URLSearchParams) =>
    params.get('checkout') === 'success'
    || (params.get('status') === 'active' && !!params.get('subscription_id'))
    || (params.get('status') === 'succeeded' && !!params.get('payment_id')),
}));

describe('AuthProvider checkout return', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.initAuth.mockReturnValue(vi.fn());
    mocks.invalidateQueries.mockResolvedValue(undefined);
    mocks.getQueriesData.mockReturnValue([[['subscription', 'user-1'], null]]);
    mocks.getCheckoutReturnPlan.mockReturnValue(null);
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('celebrates Dodo subscription returns and removes customer data from the URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/?subscription_id=sub_test&status=active&email=buyer%40example.com&campaign=preview',
    );

    render(
      <AuthProvider>
        <div>Map editor</div>
      </AuthProvider>,
    );

    expect(screen.getByRole('heading', { name: "Hooray you're officially a Wanderer!" })).toBeVisible();
    expect(screen.getByRole('status')).toHaveClass('bg-slate-950/70', 'backdrop-blur-[2px]');
    expect(screen.getByText('Map editor')).toBeInTheDocument();
    expect(window.location.search).toBe('?campaign=preview');
    expect(mocks.clearCheckoutReturnPlan).toHaveBeenCalledOnce();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['subscription'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['credit_balance'] });

    act(() => vi.advanceTimersByTime(2_999));
    expect(screen.getByRole('status')).not.toHaveClass('payment-success-overlay-exiting');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveClass('payment-success-overlay-exiting');
    act(() => vi.advanceTimersByTime(450));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps credit top-up returns as a confirmation toast', async () => {
    mocks.getCheckoutReturnPlan.mockReturnValue('topup');
    window.history.replaceState(null, '', '/?checkout=success');

    render(
      <AuthProvider>
        <div>Map editor</div>
      </AuthProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Payment received.', { duration: 6000 });
  });

  describe('after a 3-day pass checkout', () => {
    const PASS_TOAST = { id: 'checkout-pass' };
    const subscriptionCalls = () =>
      mocks.invalidateQueries.mock.calls.filter(([arg]) => arg.queryKey[0] === 'subscription').length;
    const passArrives = () =>
      mocks.getQueriesData.mockReturnValue([[['subscription', 'user-1'], { pass_expires_at: '2999-01-01T00:00:00Z' }]]);

    beforeEach(() => {
      mocks.getCheckoutReturnPlan.mockReturnValue('pass_3day');
      window.history.replaceState(null, '', '/?payment_id=pay_123&status=succeeded&email=buyer%40example.com');
    });

    const mount = () =>
      render(
        <AuthProvider>
          <div>Map editor</div>
        </AuthProvider>,
      );

    it('says the pass is activating, refetches the plan and strips the payment id', async () => {
      mount();

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(mocks.toastLoading).toHaveBeenCalledWith('Activating your pass…', PASS_TOAST);
      expect(window.location.search).toBe('');
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['subscription'] });
    });

    it('refetches with growing gaps and confirms as soon as the pass is active', async () => {
      mount();
      expect(subscriptionCalls()).toBe(1);

      await act(() => vi.advanceTimersByTimeAsync(999));
      expect(subscriptionCalls()).toBe(1);
      await act(() => vi.advanceTimersByTimeAsync(1)); // 1 s
      expect(subscriptionCalls()).toBe(2);
      await act(() => vi.advanceTimersByTimeAsync(2_000)); // 3 s
      expect(subscriptionCalls()).toBe(3);
      await act(() => vi.advanceTimersByTimeAsync(4_000)); // 7 s
      expect(subscriptionCalls()).toBe(4);
      expect(mocks.toastSuccess).not.toHaveBeenCalled();

      passArrives();
      await act(() => vi.advanceTimersByTimeAsync(8_000)); // 15 s
      expect(subscriptionCalls()).toBe(5);
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Your 3-day pass is active.', { ...PASS_TOAST, duration: 6000 });

      await act(() => vi.advanceTimersByTimeAsync(120_000));
      expect(subscriptionCalls()).toBe(5);
      expect(mocks.toastInfo).not.toHaveBeenCalled();
    });

    it('stops with a plain message when the pass has not shown up', async () => {
      mount();

      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

      expect(mocks.toastInfo).toHaveBeenCalledWith(
        "Still processing, it'll appear shortly. Refresh in a minute.",
        { ...PASS_TOAST, duration: 10_000 },
      );
      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      const calls = subscriptionCalls();
      expect(calls).toBeGreaterThan(3);
      expect(calls).toBeLessThan(10);
      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
      expect(subscriptionCalls()).toBe(calls);
    });

    it('does not count a pass that was already running as the new one', async () => {
      mocks.getQueriesData.mockReturnValue([[['subscription', 'user-1'], { pass_expires_at: '2999-01-01T00:00:00Z' }]]);
      mount();

      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

      expect(mocks.toastSuccess).not.toHaveBeenCalled();
      expect(mocks.toastInfo).toHaveBeenCalled();
    });

    it('stops refetching when the app unmounts', async () => {
      const { unmount } = mount();
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      const calls = subscriptionCalls();

      unmount();
      await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

      expect(subscriptionCalls()).toBe(calls);
      expect(mocks.toastInfo).not.toHaveBeenCalled();
    });
  });

  it('keeps refetching a subscription return until the subscription is active, without a toast', async () => {
    window.history.replaceState(null, '', '/?subscription_id=sub_test&status=active');
    render(
      <AuthProvider>
        <div>Map editor</div>
      </AuthProvider>,
    );
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(4); // subscription + credits, twice

    mocks.getQueriesData.mockReturnValue([[['subscription', 'user-1'], { tier: 'wanderer', status: 'active', renewal_date: null }]]);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    const calls = mocks.invalidateQueries.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(calls);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });
});
