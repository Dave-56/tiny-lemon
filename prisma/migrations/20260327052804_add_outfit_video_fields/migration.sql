-- AlterTable
ALTER TABLE "Outfit" ADD COLUMN     "videoErrorMessage" TEXT,
ADD COLUMN     "videoGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "videoJobId" TEXT,
ADD COLUMN     "videoStatus" TEXT,
ADD COLUMN     "videoUrl" TEXT;
