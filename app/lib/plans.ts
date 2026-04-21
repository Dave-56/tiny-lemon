export const BILLING_PLANS = {
  Starter: "Starter",
  Growth: "Growth",
  Scale: "Scale",
} as const;

const UPSCALE_ALLOWED_PLANS = new Set<string>(["Growth", "Scale"]);

/**
 * Whether the given plan (or beta status) allows image upscaling.
 * Growth, Scale, and beta users can upscale. Free and Starter cannot.
 */
export function canUpscale(plan: string, isBeta: boolean): boolean {
  if (isBeta) return true;
  return UPSCALE_ALLOWED_PLANS.has(plan);
}

/**
 * Whether the given plan (or beta status) allows video generation.
 * Beta-only for V1.
 */
export function canGenerateVideo(plan: string, isBeta: boolean): boolean {
  return isBeta;
}
