-- CreateEnum
CREATE TYPE "PlaceProvider" AS ENUM ('GOOGLE_PLACES');

-- AlterTable
ALTER TABLE "PlaceCache" ADD COLUMN     "canonicalPlaceId" TEXT;

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "formattedAddress" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "category" TEXT,
    "confidence" DOUBLE PRECISION,
    "lastValidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceProviderAlias" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "provider" "PlaceProvider" NOT NULL,
    "providerPlaceId" TEXT NOT NULL,
    "providerPayloadVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceProviderAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceQueryCache" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceQueryCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Place_fingerprint_key" ON "Place"("fingerprint");

-- CreateIndex
CREATE INDEX "Place_normalizedName_idx" ON "Place"("normalizedName");

-- CreateIndex
CREATE INDEX "Place_city_country_idx" ON "Place"("city", "country");

-- CreateIndex
CREATE INDEX "Place_expiresAt_idx" ON "Place"("expiresAt");

-- CreateIndex
CREATE INDEX "PlaceProviderAlias_placeId_idx" ON "PlaceProviderAlias"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceProviderAlias_provider_providerPlaceId_key" ON "PlaceProviderAlias"("provider", "providerPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceProviderAlias_placeId_provider_key" ON "PlaceProviderAlias"("placeId", "provider");

-- CreateIndex
CREATE INDEX "PlaceQueryCache_placeId_idx" ON "PlaceQueryCache"("placeId");

-- CreateIndex
CREATE INDEX "PlaceQueryCache_expiresAt_idx" ON "PlaceQueryCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceQueryCache_name_context_key" ON "PlaceQueryCache"("name", "context");

-- CreateIndex
CREATE INDEX "PlaceCache_canonicalPlaceId_idx" ON "PlaceCache"("canonicalPlaceId");

-- AddForeignKey
ALTER TABLE "PlaceCache" ADD CONSTRAINT "PlaceCache_canonicalPlaceId_fkey" FOREIGN KEY ("canonicalPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceProviderAlias" ADD CONSTRAINT "PlaceProviderAlias_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceQueryCache" ADD CONSTRAINT "PlaceQueryCache_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;
