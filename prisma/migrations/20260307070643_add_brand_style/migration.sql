-- CreateTable
CREATE TABLE "BrandStyle" (
    "shopId" TEXT NOT NULL,
    "styleIds" TEXT[],
    "angleIds" TEXT[],
    "stylingDirectionId" TEXT NOT NULL DEFAULT 'minimal',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandStyle_pkey" PRIMARY KEY ("shopId")
);

-- AddForeignKey
ALTER TABLE "BrandStyle" ADD CONSTRAINT "BrandStyle_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
