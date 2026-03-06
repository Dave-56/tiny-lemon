-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outfit" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frontFlatLayUrl" TEXT NOT NULL,
    "backFlatLayUrl" TEXT,
    "garmentSpec" JSONB,
    "modelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outfit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "outfitId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "pose" TEXT NOT NULL,
    "styleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditBalance" (
    "shopId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditBalance_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Outfit" ADD CONSTRAINT "Outfit_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
