CREATE TABLE "SingleImageRegenerationAllowance" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "outfitId" TEXT NOT NULL,
    "pose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SingleImageRegenerationAllowance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SingleImageRegenerationAllowance_outfitId_pose_key"
ON "SingleImageRegenerationAllowance"("outfitId", "pose");

CREATE INDEX "SingleImageRegenerationAllowance_shopId_status_idx"
ON "SingleImageRegenerationAllowance"("shopId", "status");

ALTER TABLE "SingleImageRegenerationAllowance"
ADD CONSTRAINT "SingleImageRegenerationAllowance_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SingleImageRegenerationAllowance"
ADD CONSTRAINT "SingleImageRegenerationAllowance_outfitId_fkey"
FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
