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

export const BETA_LAUNCH_STAGES = [
  "pre-launch brand",
  "live store",
  "catalog refresh",
  "testing TinyLemon",
] as const;

export const BETA_SHOOT_GOALS = [
  "single product photos",
  "styled looks/lookbook images",
  "both product photos and styled looks",
  "just testing output quality",
] as const;

export const BETA_HERO_PRODUCT_FOCUS = [
  "product must stay exact",
  "some creative styling is okay",
  "concept exploration",
] as const;

export const BETA_STYLING_SUPPORT = [
  "yes, style the rest of the outfit",
  "no, keep it minimal",
  "sometimes",
] as const;

export const BETA_GRAPHIC_SENSITIVITY = [
  "logos/text/graphics must be preserved",
  "some products have graphics",
  "mostly plain products",
  "not sure yet",
] as const;

export const BETA_OUTPUT_CHANNELS = [
  "model photos",
  "video",
  "publish to Shopify",
  "download assets",
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
