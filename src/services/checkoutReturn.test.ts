import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import secureLocalStorage from 'react-secure-storage';
import { getCheckoutReturnPlan, getPendingPlan, isSuccessfulCheckoutReturn } from './checkout';

describe('checkout return detection', () => {
  it('recognizes the configured checkout success query', () => {
    expect(isSuccessfulCheckoutReturn(new URLSearchParams('checkout=success'))).toBe(true);
  });

  it('recognizes Dodo subscription return parameters', () => {
    expect(isSuccessfulCheckoutReturn(
      new URLSearchParams('subscription_id=sub_123&status=active'),
    )).toBe(true);
  });

  it('recognizes Dodo one-time payment return parameters (3-day pass)', () => {
    expect(isSuccessfulCheckoutReturn(
      new URLSearchParams('payment_id=pay_123&status=succeeded'),
    )).toBe(true);
  });

  it('does not treat incomplete or cancelled returns as successful', () => {
    expect(isSuccessfulCheckoutReturn(new URLSearchParams('status=active'))).toBe(false);
    expect(isSuccessfulCheckoutReturn(new URLSearchParams('status=succeeded'))).toBe(false);
    expect(isSuccessfulCheckoutReturn(
      new URLSearchParams('payment_id=pay_123&status=failed'),
    )).toBe(false);
    expect(isSuccessfulCheckoutReturn(
      new URLSearchParams('subscription_id=sub_123&status=cancelled'),
    )).toBe(false);
  });
});

describe('3-day pass plan memory', () => {
  it('resumes a pass checkout after sign-in and recognizes a pass return', () => {
    vi.mocked(secureLocalStorage.getItem).mockReturnValue('pass_3day');
    expect(getPendingPlan()).toBe('pass_3day');
    expect(getCheckoutReturnPlan()).toBe('pass_3day');
  });

  it('ignores unknown stored plans', () => {
    vi.mocked(secureLocalStorage.getItem).mockReturnValue('free_forever');
    expect(getPendingPlan()).toBeNull();
    expect(getCheckoutReturnPlan()).toBeNull();
  });
});
