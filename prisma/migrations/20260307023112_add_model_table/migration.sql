-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "ethnicity" TEXT NOT NULL,
    "skinTone" TEXT NOT NULL,
    "bodyBuild" TEXT NOT NULL,
    "height" TEXT NOT NULL,
    "hairStyle" TEXT NOT NULL,
    "hairColor" TEXT NOT NULL,
    "ageRange" TEXT NOT NULL,
    "estimatedAge" TEXT,
    "imageUrl" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Model" ADD CONSTRAINT "Model_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
