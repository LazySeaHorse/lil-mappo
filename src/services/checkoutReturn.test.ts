import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('react-secure-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

import { isSuccessfulCheckoutReturn } from './checkout';

describe('checkout return detection', () => {
  it('recognizes the configured checkout success query', () => {
    expect(isSuccessfulCheckoutReturn(new URLSearchParams('checkout=success'))).toBe(true);
  });

  it('recognizes Dodo subscription return parameters', () => {
    expect(isSuccessfulCheckoutReturn(
      new URLSearchParams('subscription_id=sub_123&status=active'),
    )).toBe(true);
  });

  it('does not treat incomplete or cancelled returns as successful', () => {
    expect(isSuccessfulCheckoutReturn(new URLSearchParams('status=active'))).toBe(false);
    expect(isSuccessfulCheckoutReturn(
      new URLSearchParams('subscription_id=sub_123&status=cancelled'),
    )).toBe(false);
  });
});
