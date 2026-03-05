-- CreateTable
CREATE TABLE "ItineraryItemImage" (
    "id" TEXT NOT NULL,
    "itineraryItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "assetId" TEXT,
    "url" TEXT NOT NULL,
    "attributionJson" JSONB,
    "provider" "ImageSourceProvider",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItineraryItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryItemImage_itineraryItemId_position_key" ON "ItineraryItemImage"("itineraryItemId", "position");

-- CreateIndex
CREATE INDEX "ItineraryItemImage_itineraryItemId_idx" ON "ItineraryItemImage"("itineraryItemId");

-- CreateIndex
CREATE INDEX "ItineraryItemImage_assetId_idx" ON "ItineraryItemImage"("assetId");

-- AddForeignKey
ALTER TABLE "ItineraryItemImage" ADD CONSTRAINT "ItineraryItemImage_itineraryItemId_fkey" FOREIGN KEY ("itineraryItemId") REFERENCES "ItineraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItemImage" ADD CONSTRAINT "ItineraryItemImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "PlaceImageAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
