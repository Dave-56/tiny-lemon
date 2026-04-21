-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Outfit_shopId_deletedAt_createdAt_idx" ON "Outfit"("shopId", "deletedAt", "createdAt");
