import { describe, expect, it } from 'vitest';
import type { Subscription } from './database.types';
import { analyticsPlan, subscriptionTier, withProPass } from './proPass';

const SUB: Subscription = {
  user_id: 'u1',
  tier: 'wanderer',
  monthly_credits: 100,
  parallel_renders: 1,
  renewal_date: '2026-11-18',
  dodo_subscription_id: 'sub-1',
  status: 'active',
  created_at: '2026-08-30T00:00:00Z',
  updated_at: '2026-08-30T00:00:00Z',
};

describe('withProPass', () => {
  it('builds a pass-only row that carries no subscription', () => {
    expect(withProPass(null, '2026-10-21T15:00:00Z', 'u1')).toMatchObject({
      user_id: 'u1',
      status: 'none',
      renewal_date: null,
      dodo_subscription_id: null,
      pass_expires_at: '2026-10-21T15:00:00Z',
    });
  });

  it('never changes the subscription fields', () => {
    expect(withProPass(SUB, '2026-10-21T15:00:00Z', 'u1')).toEqual({ ...SUB, pass_expires_at: '2026-10-21T15:00:00Z' });
  });
});

describe('subscriptionTier and analyticsPlan', () => {
  const pass = withProPass(null, '2026-10-21T15:00:00Z', 'u1');

  it('reports the subscription tier, never a tier for a pass alone', () => {
    expect(subscriptionTier(SUB)).toBe('wanderer');
    expect(subscriptionTier(pass)).toBeNull();
    expect(subscriptionTier(null)).toBeNull();
  });

  it('labels the plan for analytics', () => {
    expect(analyticsPlan(SUB)).toBe('wanderer');
    expect(analyticsPlan(pass)).toBe('pass');
    expect(analyticsPlan(null)).toBe('free');
  });
});
