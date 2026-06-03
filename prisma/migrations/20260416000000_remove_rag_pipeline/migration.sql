-- Migration: Remove RAG pipeline (LH-104)
-- Drops the Activity and City tables (used exclusively for vector embedding search)
-- and removes the embedding column from Experience.
-- The CityPlanCache table is retained (used for plan pool caching, not RAG).

-- Drop Activity first (it has a FK to City)
DROP TABLE IF EXISTS "Activity";

-- Drop City (no longer referenced)
DROP TABLE IF EXISTS "City";

-- Remove embedding column from Experience (was optional, never populated in prod)
ALTER TABLE "Experience" DROP COLUMN IF EXISTS "embedding";
