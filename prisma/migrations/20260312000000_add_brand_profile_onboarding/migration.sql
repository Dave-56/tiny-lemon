-- AlterTable: add brand profile + onboarding fields to BrandStyle
ALTER TABLE "BrandStyle"
  ADD COLUMN "brandEnergy" TEXT,
  ADD COLUMN "primaryCategory" TEXT,
  ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing merchants have already configured the app — mark as completed
-- so they are not forced through onboarding on next login.
UPDATE "BrandStyle" SET "onboardingCompleted" = true;
