-- Trip revision history and optimistic concurrency for itinerary writes.

ALTER TABLE "Trip"
ADD COLUMN IF NOT EXISTS "currentVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "TripRevision" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "reason" TEXT,
  "jobId" TEXT,
  "generationId" TEXT,
  "restoredFromVersion" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TripRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TripRevision_tripId_version_key"
ON "TripRevision"("tripId", "version");

CREATE INDEX IF NOT EXISTS "TripRevision_tripId_createdAt_idx"
ON "TripRevision"("tripId", "createdAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TripRevision_tripId_fkey'
  ) THEN
    ALTER TABLE "TripRevision"
    ADD CONSTRAINT "TripRevision_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
