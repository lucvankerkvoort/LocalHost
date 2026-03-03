-- Persist reusable place photo URLs and keep canonical place IDs on itinerary items.
-- Safe for already-provisioned environments.

ALTER TABLE "Activity"
ADD COLUMN IF NOT EXISTS "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "ItineraryItem"
ADD COLUMN IF NOT EXISTS "placeId" TEXT;

CREATE INDEX IF NOT EXISTS "ItineraryItem_placeId_idx"
ON "ItineraryItem"("placeId");
