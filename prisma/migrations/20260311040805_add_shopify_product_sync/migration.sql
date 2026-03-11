-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN     "shopifyProductId" TEXT,
ADD COLUMN     "shopifyProductUrl" TEXT,
ADD COLUMN     "shopifySyncStatus" TEXT,
ADD COLUMN     "shopifySyncedAt" TIMESTAMP(3);
