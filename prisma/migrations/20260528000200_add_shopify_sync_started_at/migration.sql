-- Separate in-progress sync timing from the last successful Shopify sync time.
ALTER TABLE "Outfit"
ADD COLUMN     "shopifySyncStartedAt" TIMESTAMP(3);
