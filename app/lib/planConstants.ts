/**
 * One-time free trial: the total number of outfit generations a store gets
 * before choosing a paid plan. This is a lifetime allowance, not a monthly one.
 */
export const FREE_TRIAL_GENERATION_LIMIT = 10;

/** Kept for existing imports; the free allowance is the one-time trial above. */
export const FREE_PLAN_GENERATION_LIMIT = FREE_TRIAL_GENERATION_LIMIT;

/**
 * Internal / test stores with manually granted access keep a monthly allowance.
 * Their per-shop `betaCap` sets the real number; this is only the floor.
 */
export const BETA_LAUNCH_GENERATION_CAP = 1;

export const FREE_TRIAL_LIMIT_MESSAGE =
  `You've used your ${FREE_TRIAL_GENERATION_LIMIT} free outfits. Upgrade to keep generating.`;
export const MONTHLY_LIMIT_MESSAGE =
  "You've used all your generations this month. Upgrade to continue.";
export const INTERNAL_LIMIT_MESSAGE =
  "You've used your beta allocation for now. Contact us if you need more access.";

export type LimitMessageEntitlements = { publicPlan: string; isBeta: boolean };

/** Merchant-facing copy when a generation is refused for lack of credits. */
export function createLimitReachedMessage(entitlements: LimitMessageEntitlements): string {
  if (entitlements.isBeta) return INTERNAL_LIMIT_MESSAGE;
  if (entitlements.publicPlan === "free") return FREE_TRIAL_LIMIT_MESSAGE;
  return MONTHLY_LIMIT_MESSAGE;
}
