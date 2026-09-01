import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthProvider';

const mocks = vi.hoisted(() => ({
  initAuth: vi.fn(),
  invalidateQueries: vi.fn(),
  clearCheckoutReturnPlan: vi.fn(),
  getCheckoutReturnPlan: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { initAuth: typeof mocks.initAuth }) => unknown) =>
    selector({ initAuth: mocks.initAuth }),
}));

vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: mocks.invalidateQueries },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess },
}));

vi.mock('@/services/checkout', () => ({
  PLAN_CONFIG: {
    wanderer: { name: 'Wanderer' },
    cartographer: { name: 'Cartographer' },
    pioneer: { name: 'Pioneer' },
  },
  clearCheckoutReturnPlan: mocks.clearCheckoutReturnPlan,
  getCheckoutReturnPlan: mocks.getCheckoutReturnPlan,
  isSuccessfulCheckoutReturn: (params: URLSearchParams) =>
    params.get('checkout') === 'success'
    || (params.get('status') === 'active' && !!params.get('subscription_id')),
}));

describe('AuthProvider checkout return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.initAuth.mockReturnValue(vi.fn());
    mocks.getCheckoutReturnPlan.mockReturnValue(null);
    window.history.replaceState(null, '', '/');
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

    expect(screen.getByRole('heading', { name: "You're a Wanderer now." })).toBeVisible();
    expect(screen.getByText('Map editor')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe('?campaign=preview');
    });
    expect(mocks.clearCheckoutReturnPlan).toHaveBeenCalledOnce();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['subscription'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['credit_balance'] });

    fireEvent.click(screen.getByRole('button', { name: 'Back to your map' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Payment received.', { duration: 6000 });
    });
  });
});
