-- LH-101: Add JSONB itinerary column to Trip table
-- This is a safe, additive migration. Normalized tables are preserved.

-- AlterTable: add the JSONB column (nullable — pre-migration rows will be NULL)
ALTER TABLE "Trip" ADD COLUMN "itineraryData" JSONB;

-- GIN index for efficient JSONB path queries
-- Prisma cannot express GIN indexes in the schema file, so this is a raw migration.
CREATE INDEX IF NOT EXISTS "Trip_itineraryData_gin"
ON "Trip" USING GIN ("itineraryData" jsonb_path_ops);
