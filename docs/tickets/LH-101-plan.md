# LH-101 Implementation Plan — JSONB Schema Simplification

## What this is

Collapse the 5-level normalized itinerary hierarchy
(`TripAnchor → ItineraryDay → ItineraryItem → ItineraryItemImage`)
into a single `itineraryData` JSONB column on the `Trip` table.
The JSONB shape already exists: it is the `TripPlanWritePayload` type
defined in `src/lib/trips/contracts/trip-plan.schema.ts`.
`TripRevision.payload` already stores this shape — we are promoting
that pattern to the live data path.

## Scope boundary

This ticket touches **trip itinerary storage only**.
Bookings, Experiences, Chat, Auth, Places, Images, RAG are untouched.
`TripRevision` stays as-is — it is already JSONB and serves as history.

---

## The complication: `Booking.itemId`

`Booking` has a foreign key to `ItineraryItem.id`. This is the one
structural constraint that prevents us from simply dropping the normalized
tables. The plan handles this in two phases:

- **This PR**: keep the normalized tables; swap the read/write path to JSONB.
  `Booking.itemId` FK stays intact.
- **Follow-up** (separate PR): drop the FK constraint, change `itemId` to a
  plain `String?`, then remove the normalized tables from the schema.

---

## Files that change

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `itineraryData Json?` to `Trip`; add GIN index |
| `prisma/migrations/` | Auto-generated migration from `prisma migrate dev` |
| `src/lib/trips/repository.ts` | Dual-write + JSONB-first read in `saveTripPlanSnapshotForUser` and `loadTripPlanSnapshotForUser` |
| `src/lib/trips/contracts/trip-plan.schema.ts` | Confirm JSONB shape matches (likely no change) |
| `scripts/backfill-itinerary-jsonb.ts` | New: one-time migration from normalized tables → JSONB column |

No API routes, no Redux slices, no UI components change.

---

## Step-by-step

### Step 1 — Schema: add the column + index

In `prisma/schema.prisma`, add to the `Trip` model:

```prisma
model Trip {
  // ... existing fields ...
  itineraryData Json?   // JSONB blob — replaces TripAnchor/ItineraryDay/ItineraryItem hierarchy

  @@index([userId])
}
```

Then in the migration SQL (or via `prisma migrate dev`), add the GIN index
that Prisma cannot express in the schema file:

```sql
CREATE INDEX IF NOT EXISTS "Trip_itineraryData_gin"
ON "Trip" USING GIN ("itineraryData" jsonb_path_ops);
```

Add this as a raw SQL migration file.

### Step 2 — Repository: dual-write

Update `saveTripPlanSnapshotForUser` in `repository.ts`:
1. Serialize the stop payload to the existing `TripPlanWritePayload` shape.
2. Write the JSONB blob to `Trip.itineraryData` in the same transaction
   as the normalized table writes.
3. Keep the normalized writes for now (Booking FK safety).

```ts
// Inside the transaction:
await prisma.trip.update({
  where: { id: tripId },
  data: { itineraryData: { stops: normalizedStops } },
});
```

### Step 3 — Repository: JSONB-first read

Update `loadTripPlanSnapshotForUser`:
1. Select `itineraryData` from `Trip`.
2. If present and non-empty → parse and return it directly.
3. If null (pre-migration rows) → fall back to the existing normalized
   table joins (current behaviour, untouched).

```ts
const trip = await prisma.trip.findFirst({ select: { itineraryData: true, ... } });
if (trip.itineraryData) {
  return deserializeFromJsonb(trip.itineraryData);
}
// fallback: existing normalized join query
```

Validate the JSONB output with the existing `TripPlanWritePayloadSchema`
Zod schema before returning — same contract as today.

### Step 4 — Backfill script

`scripts/backfill-itinerary-jsonb.ts`:
- Query all trips where `itineraryData IS NULL`.
- For each, run the existing normalized read (`loadTripPlanSnapshotForUser`
  fallback path), then write the result to `itineraryData`.
- Log success/failure per trip. Safe to re-run (idempotent: skips trips
  where `itineraryData` is already set).

```
pnpm tsx scripts/backfill-itinerary-jsonb.ts
```

### Step 5 — Verify

Run `EXPLAIN ANALYZE` on the primary read query to confirm GIN index usage:

```sql
EXPLAIN ANALYZE
SELECT id FROM "Trip"
WHERE "itineraryData" @> '{"stops": []}';
```

---

## What this PR does NOT do

- Does not drop `TripAnchor`, `ItineraryDay`, `ItineraryItem`, `ItineraryItemImage`.
- Does not remove `Booking.itemId` FK.
- Does not change any API routes, Redux, or UI.
- Does not touch `TripRevision`.

The normalized tables become write-redundant after this PR but stay in
the schema until the FK constraint on `Booking.itemId` is resolved in a
follow-up.

---

## Definition of done

- [ ] `Trip.itineraryData` column exists in production schema with GIN index
- [ ] `saveTripPlanSnapshotForUser` writes to JSONB + normalized tables
- [ ] `loadTripPlanSnapshotForUser` reads from JSONB first, falls back gracefully
- [ ] Zod validation on JSONB read path (same schema as today)
- [ ] Backfill script written, tested locally against dev DB
- [ ] `EXPLAIN ANALYZE` confirms GIN index is used
- [ ] Existing unit tests pass unchanged
- [ ] No API contract changes — callers see identical response shapes
