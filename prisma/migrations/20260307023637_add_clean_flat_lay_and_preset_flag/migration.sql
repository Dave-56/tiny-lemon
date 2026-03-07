-- AlterTable
ALTER TABLE "Model" ADD COLUMN     "isPreset" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN     "cleanBackFlatLayUrl" TEXT,
ADD COLUMN     "cleanFlatLayUrl" TEXT;
