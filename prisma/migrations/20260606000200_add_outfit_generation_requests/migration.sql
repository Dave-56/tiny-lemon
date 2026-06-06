CREATE TABLE "OutfitGenerationRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "outfitId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "merchantDirection" TEXT,
    "frontDescription" TEXT,
    "backDescription" TEXT,
    "targetPoses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resolvedPoses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "modelId" TEXT NOT NULL,
    "brandStyleId" TEXT NOT NULL,
    "brandEnergy" TEXT,
    "pricePoint" TEXT,
    "primaryCategory" TEXT,
    "requestKey" TEXT NOT NULL,
    "runToken" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enqueuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutfitGenerationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutfitGenerationRequest_shopId_operation_requestKey_runToken_key"
ON "OutfitGenerationRequest"("shopId", "operation", "requestKey", "runToken");

CREATE INDEX "OutfitGenerationRequest_shopId_status_createdAt_idx"
ON "OutfitGenerationRequest"("shopId", "status", "createdAt");

CREATE INDEX "OutfitGenerationRequest_outfitId_createdAt_idx"
ON "OutfitGenerationRequest"("outfitId", "createdAt");

CREATE INDEX "OutfitGenerationRequest_jobId_idx"
ON "OutfitGenerationRequest"("jobId");

ALTER TABLE "OutfitGenerationRequest"
ADD CONSTRAINT "OutfitGenerationRequest_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutfitGenerationRequest"
ADD CONSTRAINT "OutfitGenerationRequest_outfitId_fkey"
FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
