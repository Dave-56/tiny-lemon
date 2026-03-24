CREATE TABLE "RequestIdempotency" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "runToken" TEXT NOT NULL,
    "outfitId" TEXT,
    "jobId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RequestIdempotency_shopId_operation_requestKey_key"
ON "RequestIdempotency"("shopId", "operation", "requestKey");

CREATE INDEX "RequestIdempotency_shopId_status_expiresAt_idx"
ON "RequestIdempotency"("shopId", "status", "expiresAt");

ALTER TABLE "RequestIdempotency"
ADD CONSTRAINT "RequestIdempotency_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
