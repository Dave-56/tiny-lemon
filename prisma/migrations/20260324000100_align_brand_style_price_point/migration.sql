-- Align BrandStyle with the Prisma schema after the column rename/removal
-- happened outside the migration history.
ALTER TABLE "BrandStyle"
  DROP COLUMN IF EXISTS "styleIds",
  ADD COLUMN IF NOT EXISTS "pricePoint" TEXT;
