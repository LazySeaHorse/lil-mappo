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
