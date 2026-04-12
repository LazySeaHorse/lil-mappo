import type { Subscription, CreditBalance } from './database.types';

/**
 * Returns true if the user is allowed to push new cloud saves.
 *
 * Rules:
 *  - Any active subscription on a metered tier (wanderer / cartographer / pioneer)
 *    gets unconditional cloud save access.
 *  - Nomad tier (credit-pack buyers & ex-subscribers) can cloud-save only while
 *    their purchased_credits balance is > 0.  Credits are never spent by saving;
 *    they just act as a gate.
 *  - Anything else (no subscription row, or status !== 'active') → false.
 */
export function canCloudSave(
  subscription: Subscription | null | undefined,
  credits: CreditBalance | null | undefined
): boolean {
  if (!subscription || subscription.status !== 'active') return false;

  if (subscription.tier === 'nomad') {
    return (credits?.purchased_credits ?? 0) > 0;
  }

  // wanderer | cartographer | pioneer — unlimited cloud saves
  return true;
}
