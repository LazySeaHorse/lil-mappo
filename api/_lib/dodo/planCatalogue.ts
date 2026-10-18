import type { PlanConfig, Plans } from './types.js';

// ─── Product catalogue ────────────────────────────────────────────────────────
// Product IDs differ between test_mode and live_mode — read from env vars.
// The topup product ID is only used to identify topup payments in this webhook.

export function buildPlanFromProduct(): Plans {
  const entries: Array<[string | undefined, PlanConfig]> = [
    [process.env.DODO_PRODUCT_WANDERER,     { tier: "wanderer",     monthlyCredits: 100,  parallelRenders: 1 }],
    [process.env.DODO_PRODUCT_CARTOGRAPHER, { tier: "cartographer", monthlyCredits: 500,  parallelRenders: 2 }],
    [process.env.DODO_PRODUCT_PIONEER,      { tier: "pioneer",      monthlyCredits: 2000, parallelRenders: 5 }],
  ];
  const map: Plans = {};
  for (const [id, config] of entries) {
    if (id) map[id] = config;
  }
  return map;
}

// ─── Pro pass ────────────────────────────────────────────────────────────────
// A one-time product (not a subscription) that unlocks Wanderer for a few days.
// Granted only by the payment.succeeded webhook (see BillingService.grantProPass).

export const PASS_PLAN = "pass_3day";
export const PASS_DAYS = 3;
/** The pass price in USD cents. A USD payment below this never grants a pass. */
export const PASS_PRICE_CENTS = 300;

/** The Dodo product id of the pass, or undefined when it is not configured. */
export function passProductId(): string | undefined {
  return process.env.DODO_PRODUCT_PASS_3DAY || undefined;
}
