ALTER TABLE "Shop"
  ADD COLUMN "betaAccess" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "betaStatus" TEXT,
  ADD COLUMN "betaCap" INTEGER,
  ADD COLUMN "betaGrantedAt" TIMESTAMP(3),
  ADD COLUMN "betaGrantedBy" TEXT,
  ADD COLUMN "betaGrantedReason" TEXT,
  ADD COLUMN "betaActivatedAt" TIMESTAMP(3),
  ADD COLUMN "betaWelcomeCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "betaIntakeCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "betaOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "storeUrl" TEXT,
  ADD COLUMN "catalogType" TEXT,
  ADD COLUMN "skuVolume" TEXT,
  ADD COLUMN "photoWorkflow" TEXT,
  ADD COLUMN "biggestPain" TEXT,
  ADD COLUMN "intendedUseCase" TEXT;

CREATE TABLE "BetaFeedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shopId" TEXT NOT NULL,
  "outfitId" TEXT,
  "rating" TEXT,
  "category" TEXT,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BetaFeedback_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BetaFeedback_shopId_idx" ON "BetaFeedback"("shopId");
