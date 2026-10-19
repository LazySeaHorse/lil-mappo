import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/useAuthStore';
import { isProNow } from './currentPlan';

const wanderer = { tier: 'wanderer', status: 'active', renewal_date: null };
const passOnly = { tier: null, status: 'none', pass_expires_at: new Date(Date.now() + 3_600_000).toISOString() };
const endedPass = { tier: null, status: 'none', pass_expires_at: new Date(Date.now() - 3_600_000).toISOString() };

describe('isProNow', () => {
  beforeEach(() => {
    queryClient.clear();
    useAuthStore.setState({ user: { id: 'u1' } as never });
  });
  afterEach(() => {
    queryClient.clear();
    useAuthStore.setState({ user: null });
  });

  it('is false for a guest, even if a plan is cached for someone else', () => {
    queryClient.setQueryData(['subscription', 'u1'], wanderer);
    useAuthStore.setState({ user: null });
    expect(isProNow()).toBe(false);
  });

  it('is false while the plan has not loaded, and for a free user', () => {
    expect(isProNow()).toBe(false);
    queryClient.setQueryData(['subscription', 'u1'], null);
    expect(isProNow()).toBe(false);
  });

  it('is true for a subscriber and for a live Pro pass, false once the pass has ended', () => {
    queryClient.setQueryData(['subscription', 'u1'], wanderer);
    expect(isProNow()).toBe(true);
    queryClient.setQueryData(['subscription', 'u1'], passOnly);
    expect(isProNow()).toBe(true);
    queryClient.setQueryData(['subscription', 'u1'], endedPass);
    expect(isProNow()).toBe(false);
  });

  it('ignores a plan cached for another user', () => {
    queryClient.setQueryData(['subscription', 'someone-else'], wanderer);
    expect(isProNow()).toBe(false);
  });
});
