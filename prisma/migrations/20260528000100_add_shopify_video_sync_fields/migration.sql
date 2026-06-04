-- Track Shopify-hosted video objects so republishing can replace app-created video media without duplicates.
ALTER TABLE "Outfit"
ADD COLUMN     "shopifyVideoFileId" TEXT,
ADD COLUMN     "shopifyVideoMediaId" TEXT;
