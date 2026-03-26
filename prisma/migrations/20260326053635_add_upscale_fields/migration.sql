-- AlterTable
ALTER TABLE "GeneratedImage" ADD COLUMN     "upscaleJobId" TEXT,
ADD COLUMN     "upscaleStatus" TEXT,
ADD COLUMN     "upscaledAt" TIMESTAMP(3);
