-- AlterEnum
ALTER TYPE "ExternalApiProvider" ADD VALUE IF NOT EXISTS 'UNSPLASH';
ALTER TYPE "ExternalApiProvider" ADD VALUE IF NOT EXISTS 'PEXELS';

-- CreateEnum
CREATE TYPE "ImageSourceProvider" AS ENUM ('UNSPLASH', 'PEXELS', 'GOOGLE_PLACES');

-- CreateEnum
CREATE TYPE "ImageVerificationStatus" AS ENUM ('VERIFIED', 'REJECTED', 'REVIEW');

-- CreateTable
CREATE TABLE "PlaceImageAsset" (
    "id" TEXT NOT NULL,
    "placeId" TEXT,
    "queryKey" TEXT NOT NULL,
    "provider" "ImageSourceProvider" NOT NULL,
    "providerImageId" TEXT NOT NULL,
    "providerPhotoRef" TEXT,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "attributionJson" JSONB NOT NULL,
    "licenseCode" TEXT NOT NULL,
    "photographerName" TEXT,
    "status" "ImageVerificationStatus" NOT NULL,
    "deterministicScore" DOUBLE PRECISION NOT NULL,
    "llmScore" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationVersion" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceImageSelection" (
    "id" TEXT NOT NULL,
    "queryKey" TEXT NOT NULL,
    "placeId" TEXT,
    "assetId" TEXT NOT NULL,
    "provider" "ImageSourceProvider" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceImageSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaceImageAsset_provider_providerImageId_key" ON "PlaceImageAsset"("provider", "providerImageId");

-- CreateIndex
CREATE INDEX "PlaceImageAsset_queryKey_status_finalScore_idx" ON "PlaceImageAsset"("queryKey", "status", "finalScore" DESC);

-- CreateIndex
CREATE INDEX "PlaceImageAsset_placeId_status_finalScore_idx" ON "PlaceImageAsset"("placeId", "status", "finalScore" DESC);

-- CreateIndex
CREATE INDEX "PlaceImageAsset_expiresAt_idx" ON "PlaceImageAsset"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceImageSelection_queryKey_key" ON "PlaceImageSelection"("queryKey");

-- CreateIndex
CREATE INDEX "PlaceImageSelection_placeId_idx" ON "PlaceImageSelection"("placeId");

-- CreateIndex
CREATE INDEX "PlaceImageSelection_expiresAt_idx" ON "PlaceImageSelection"("expiresAt");

-- AddForeignKey
ALTER TABLE "PlaceImageSelection" ADD CONSTRAINT "PlaceImageSelection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "PlaceImageAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
