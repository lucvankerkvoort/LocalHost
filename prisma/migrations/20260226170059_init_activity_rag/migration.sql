-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable: ChatThread (safe on non-empty DBs)
DO $$
BEGIN
  IF to_regclass('"ChatThread"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ChatThread'
        AND column_name = 'createdAt'
    ) THEN
      ALTER TABLE "ChatThread"
      ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ChatThread'
        AND column_name = 'updatedAt'
    ) THEN
      ALTER TABLE "ChatThread"
      ADD COLUMN "updatedAt" TIMESTAMP(3);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ChatThread'
        AND column_name = 'bookingId'
    ) THEN
      ALTER TABLE "ChatThread"
      ALTER COLUMN "bookingId" DROP NOT NULL;
    END IF;

    UPDATE "ChatThread"
    SET "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP);

    ALTER TABLE "ChatThread"
    ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

-- AlterTable: Experience
DO $$
BEGIN
  IF to_regclass('"Experience"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Experience'
        AND column_name = 'embedding'
    ) THEN
      ALTER TABLE "Experience"
      ADD COLUMN "embedding" vector(1536);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Experience'
        AND column_name = 'engagementScore'
    ) THEN
      ALTER TABLE "Experience"
      ADD COLUMN "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
    ELSE
      ALTER TABLE "Experience"
      ALTER COLUMN "engagementScore" SET DEFAULT 1.0;
      UPDATE "Experience" SET "engagementScore" = 1.0 WHERE "engagementScore" IS NULL;
      ALTER TABLE "Experience"
      ALTER COLUMN "engagementScore" SET NOT NULL;
    END IF;
  END IF;
END $$;

-- AlterTable: Message
DO $$
BEGIN
  IF to_regclass('"Message"') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Message'
        AND column_name = 'threadId'
    ) THEN
      ALTER TABLE "Message"
      ADD COLUMN "threadId" TEXT;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Message'
        AND column_name = 'bookingId'
    ) THEN
      ALTER TABLE "Message"
      ALTER COLUMN "bookingId" DROP NOT NULL;
    END IF;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PlaceCache" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "placeId" TEXT,
  "formattedAddress" TEXT,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "category" TEXT,
  "city" TEXT,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlaceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "City" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "tier" INTEGER NOT NULL DEFAULT 3,
  "lastEnrichedAt" TIMESTAMP(3),
  "enrichmentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "activityCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Activity" (
  "id" TEXT NOT NULL,
  "cityId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'google',
  "externalId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "rating" DOUBLE PRECISION,
  "priceLevel" INTEGER,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "formattedAddress" TEXT,
  "metadataJson" JSONB DEFAULT '{}',
  "engagementScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "embedding" vector(1536),
  "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaceCache_name_idx" ON "PlaceCache"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PlaceCache_name_context_key" ON "PlaceCache"("name", "context");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "City_tier_idx" ON "City"("tier");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "City_name_country_key" ON "City"("name", "country");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Activity_externalId_key" ON "Activity"("externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Activity_cityId_idx" ON "Activity"("cityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Activity_category_idx" ON "Activity"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Activity_engagementScore_idx" ON "Activity"("engagementScore");

-- AddForeignKey
DO $$
BEGIN
  IF to_regclass('"Activity"') IS NOT NULL
     AND to_regclass('"City"') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'Activity_cityId_fkey'
     ) THEN
    ALTER TABLE "Activity"
    ADD CONSTRAINT "Activity_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
