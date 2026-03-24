export const BETA_STATUS = {
  invited: "invited",
  active: "active",
  paused: "paused",
  ended: "ended",
} as const;

export const BETA_CATALOG_TYPES = [
  "womenswear",
  "menswear",
  "unisex",
  "activewear",
  "jewelry",
  "beauty",
  "other",
] as const;

export const BETA_SKU_VOLUMES = ["1-10", "11-50", "51-200", "200+"] as const;

export const BETA_PHOTO_WORKFLOWS = [
  "studio shoot",
  "flat lays",
  "mannequin",
  "influencer/ugc",
  "mixed",
] as const;

export const BETA_BIGGEST_PAINS = [
  "cost",
  "speed",
  "inconsistency",
  "no models",
  "angle coverage",
  "editing time",
] as const;

export const BETA_INTENDED_USE_CASES = [
  "PDP images",
  "launch campaign",
  "testing concepts",
  "catalog refresh",
] as const;

export const BETA_FEEDBACK_CATEGORIES = [
  "bug",
  "result quality",
  "workflow friction",
  "support request",
  "other",
  "would_use_live",
] as const;

export const WOULD_USE_LIVE_OPTIONS = ["yes", "almost", "no"] as const;
