-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN "shopifyProductCreatedByApp" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any existing Outfit with a Shopify product was created by this app
-- (pre-picker era — the app was the only way an Outfit got linked to a product).
UPDATE "Outfit" SET "shopifyProductCreatedByApp" = true WHERE "shopifyProductId" IS NOT NULL;
