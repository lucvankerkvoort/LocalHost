-- Add metadataJson JSONB column to ItineraryItem
-- Used to store OTA booking metadata (hotel details, affiliate URLs) for LODGING items.
-- Optional field: existing rows remain unaffected (NULL).

ALTER TABLE "ItineraryItem" ADD COLUMN IF NOT EXISTS "metadataJson" JSONB;

-- Add AMADEUS_HOTELS to the ExternalApiProvider enum for budget tracking
ALTER TYPE "ExternalApiProvider" ADD VALUE IF NOT EXISTS 'AMADEUS_HOTELS';
