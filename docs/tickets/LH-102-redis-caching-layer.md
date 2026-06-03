# LH-102 — Multi-level memoization for trip generation

| Field    | Value                              |
|----------|------------------------------------|
| Type     | Story                              |
| Priority | Critical                           |
| Points   | 8                                  |
| Labels   | caching, infrastructure, ai        |

## Problem

Every trip generation request runs the full stack regardless of whether the work has been done before:

1. `ensureCityEnriched` — may hit Google Places to seed the activity catalog
2. `generateEmbedding` + pgvector search — OpenAI API call on every request
3. `draftItinerary` — full LLM call to produce a day structure
4. `planTripFromDraft` — per-activity `resolve_place` calls (Google Places)

For popular destinations (Paris, Amsterdam, Tokyo) this work is largely repeated. The result is high API cost, slow responses, and no benefit from prior generations.

## Approach — check first, generate only when necessary

Three cache levels, each checked in order before falling through to generation:

```
Request: "3 days in Paris"
          ↓
[L1] City activity catalog (Postgres Activity table + Redis pool)
     Do we have ≥ N Paris activities already?
     Yes → skip enrichment + embedding call entirely
     No  → enrich, store in Activity table, populate Redis pool
          ↓
[L2] Destination plan cache (Redis hot → Postgres durable)
     Do we have a stored plan for Paris / 3 days?
     Yes → return immediately (rotate through pool for variety)
     No  → call LLM, store result in Redis + Postgres
          ↓
[L3] Geocoding (PlaceCache — already implemented)
     Already memoized per place. No change needed.
```

The LLM is only called at L2 when no stored plan exists for that destination+duration. After the first Paris plan, every subsequent Paris request is served from cache — instantly.

## Plan pool and variety

To avoid serving identical plans to every user:

- Store up to **5 plans per destination+duration** combination
- Round-robin on serve (cursor stored in Redis)
- When pool reaches 5, stop generating new ones until TTL expires and pool is cleared
- TTL: 7 days (configurable via `CACHE_TTL_PLAN_POOL_DAYS`)

## Data model

### Redis keys
- `city:inventory:{city}:{country}` — activity pool (already implemented in this branch)
- `city:plans:{city}:{country}:{duration_days}` — JSON array of up to 5 `ItineraryPlan` objects
- `city:plans:{city}:{country}:{duration_days}:cursor` — integer, current round-robin index

### Postgres
New table `CityPlanCache`:
```
id          String   @id @default(cuid())
city        String
country     String
durationDays Int
plans       Json     -- array of ItineraryPlan, max 5
updatedAt   DateTime
expiresAt   DateTime
```

On first request: generate plan → write to Redis + Postgres.
On subsequent requests: read from Redis (fast). If Redis is cold (restart), hydrate from Postgres.

## Write-through on save (absorbs LH-103)

When a user explicitly saves a trip:
1. The finalized plan already exists in Postgres via the existing persistence layer
2. Any orphaned Redis generation keys (`gen:progress:{id}`) are cleared

The `CityPlanCache` table is separate from user trips — it is a shared read cache, not user data.

## Acceptance Criteria

- [ ] L1: City activity pool checked before any embedding/enrichment call (already partially done)
- [ ] L2: Plan pool stored per `city + country + durationDays` in Redis + Postgres
- [ ] L2: Cache hit returns a plan immediately with no LLM call
- [ ] L2: Pool rotates across up to 5 stored plans per destination
- [ ] L2: Pool is hydrated from Postgres on Redis cold start
- [ ] TTL configurable — default 7 days for plan pool, 24h for activity pool
- [ ] Logs clearly show cache hit vs miss at each level
- [ ] No Redis → app still works, all generation falls through to live calls
- [ ] `CACHE_MIN_CITY_ACTIVITIES`, `CACHE_TTL_CITY_ACTIVITIES_SECONDS`, `CACHE_TTL_PLAN_POOL_DAYS` env vars documented

## Out of scope

- Per-user personalisation of cached plans (future)
- Modifying cached plans based on user preferences (future)
- LH-104 (remove RAG) is a separate decision and should be evaluated after this is in place

## Dependencies

- LH-101 must be complete (JSONB schema in place for plan storage)
