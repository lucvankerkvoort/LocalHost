# GOTCHAS.md — Known Fragile Areas & Non-Obvious Decisions

Read this before touching any of the areas below.

---

## Trip Versioning & Concurrency

**Fragile area**: `src/lib/trips/versioning.ts` + `persistence.ts`

- Every trip write increments `currentVersion`. Writes must supply `expectedVersion` to detect conflicts.
- If you skip `expectedVersion`, concurrent edits silently overwrite each other.
- `TripRevision` rows store the full payload — changing the payload schema without a migration **breaks revision replay**.
- Optimistic locking: if `currentVersion !== expectedVersion`, the write returns a 409. The client must re-fetch and retry.
- After the Postgres transaction commits, `persistTripPlanCore` clears the `gen:progress:{generationId}` Redis key if `audit.generationId` is present. The Redis call is outside the transaction — a Redis failure does not roll back the DB write, it only leaves the progress key to expire via its 1-hour TTL.

---

## Deterministic Itinerary IDs

**Fragile area**: `src/lib/ai/plan-converter.ts`

- Destination IDs are `day-${dayNumber}` — this is intentional and must stay stable across re-applies.
- Activity/item IDs are content-hash based — changing the hash function orphans existing Redux selections and breaks image URL preservation.
- Never use `crypto.randomUUID()` or `Math.random()` for persistent itinerary IDs.

---

## Cesium Globe SVG Cache

**Fragile area**: `src/components/features/cesium-globe.tsx`

- Markers use an SVG→data-URL cache keyed by icon type + color. Creating new `BillboardCollection` instances outside this pattern causes memory leaks in the Cesium viewer.
- The Resium `Viewer` ref must be stable across re-renders — wrapping it in an effect with the wrong deps causes viewer teardown/rebuild flicker.
- Route polylines are stored as `PolylineCollection` entities. Adding individual `Entity` objects for routes (instead of the collection) causes severe performance degradation at >10 routes.

---

## Curated Destination Context (replaces RAG)

**Fragile area**: `src/data/destinations.json`, `src/lib/ai/destination-context.ts`

- The system prompt receives curated destination context (summary, highlights, neighborhoods, practical tips) from `destinations.json` for the primary trip city.
- Context is injected as a plain text block — it is a hint, not a constraint. The LLM may pick places not listed here.
- `getDestinationContext()` matches on `city` + `country` case-insensitively, checking `aliases`. If no match is found it returns `null` and the prompt runs without context.
- To add a new destination: add an entry to `destinations.json` following the existing schema. AI-generated batch content is appropriate; review for accuracy before committing.

---

## Orchestrator Rate Limiting

**Fragile area**: `src/app/api/orchestrator/route.ts`

- Hard cap: 10 requests/minute per IP stored in `RateLimitEntry`. This is intentional — each call can cost $0.05–$0.50 in LLM tokens.
- The rate limiter is stateful in the DB. In dev, resetting the DB resets rate limits.
- Do not add retry loops around orchestrator calls — they will exhaust the rate limit and block the user.

---

## Synthetic Bots & Chat

**Fragile area**: `src/lib/synthetic-bots/`

- Synthetic reply jobs have configurable latency (5–30s). In tests, use the `SYNTHETIC_BOT_LATENCY_MS=0` env override to avoid flaky timing.
- A bot host has `syntheticBotEnabled: true` and a `syntheticPersonaKey`. Changing the persona key mid-conversation causes tone inconsistency in replies.
- The `SyntheticReplyJob` processor is idempotent — re-processing a `DONE` job is a no-op, but re-processing a `PROCESSING` job creates duplicate messages. Always check job status before triggering.

---

## Stripe Connect Payouts

**Fragile area**: `src/lib/stripe/payouts.ts`

- Payouts use Stripe Connect with `payoutStatus: NOT_ELIGIBLE → ELIGIBLE → RELEASED`.
- A host must have `payoutsEnabled: true` (set by Stripe webhook after onboarding completes). Never attempt a transfer without this flag.
- Stripe Transfer creation is **not idempotent by default** — use idempotency keys derived from `bookingId` to prevent double-payouts on webhook retries.

---


## Google Places Cache

**Fragile area**: `src/lib/maps/`, `PlaceCache` + `Place` tables

- The `Place.fingerprint` deduplicates places from multiple query aliases. Changing the fingerprint algorithm invalidates the entire cache.
- `PlaceCache` rows expire — check `expiresAt` before trusting cached coordinates.
- Never call Google Places API directly from orchestrator tools — always go through the cache layer in `src/lib/maps/`.

---

## Image Selection & LLM Re-ranking

**Fragile area**: `src/lib/images/image-llm-reranker.ts`

- The re-ranker makes an LLM call per place — it's expensive. It's only triggered when the deterministic scorer returns a tie or low confidence.
- Images from Google Places have usage rights restrictions. Don't store or serve them directly — use the Places Photo API endpoint with the correct referrer.
- `image-verification.ts` uses LLM vision to score image relevance. It returns a 0–1 score; images below `0.4` are rejected. Lowering this threshold risks irrelevant images appearing on the globe.

---

## NextAuth Session Shape

**Fragile area**: `src/app/(auth)/`, `src/lib/auth.ts`

- `session.user.id` is the Prisma `User.id` (UUID). It's available server-side via `getServerSession` only — not from `useSession()` on the client without the `session` callback being configured.
- OAuth account linking: the same email from two OAuth providers creates two `User` rows unless the `signIn` callback deduplicates. Don't change the signIn callback without testing this case.

---

## HostExperience — One Per Host (MVP Constraint)

- The schema supports multiple experiences per host, but the publish flow enforces one: `POST /api/host/publish` upserts rather than creates.
- Removing this constraint requires updating the booking flow, the host profile page, and the planner's host marker logic.

---

## Engagement Score Feedback Loop

**Fragile area**: `Experience.engagementScore`

- Score decreases when the AI suggests a host experience and the user removes it from their itinerary.
- A score of 0 means the experience will never be suggested again. Do not reset scores without understanding why they dropped — it may reflect genuine user rejection signals.

---

## LODGING metadataJson — App-Layer Typing Only

**Fragile area**: `ItineraryItem.metadataJson`

- The `metadataJson` column is `Json?` (JSONB) in Postgres — no DB-level constraints.
- Validation is enforced at the app layer via `LodgingMetadataSchema` (`src/types/hotels.ts`).
- `itinerary-item.tsx` uses `LodgingMetadataSchema.safeParse()` before rendering hotel details. If parsing fails (e.g. stale/malformed data), the lodging card silently returns null — this is intentional.
- If you add fields to `LodgingMetadataSchema`, existing DB rows won't have them. Use `.optional()` for new fields or write a migration to backfill.
- Do not store anything sensitive (credentials, PII) in `metadataJson` — it's readable in the client bundle via the itinerary API response.

---

## Amadeus Hotel Client — Graceful Degradation

**Fragile area**: `src/lib/providers/amadeus-hotels-client.ts`

- If `AMADEUS_API_KEY` / `AMADEUS_API_SECRET` are unset, `searchHotels()` returns `[]` silently (no error thrown).
- The `search_hotels` orchestrator tool falls back to a Booking.com city search affiliate link when Amadeus returns no results or the city isn't in the IATA map.
- OAuth2 tokens are cached in memory with a 55-minute TTL. Token cache is lost on process restart (cold start = one extra auth round-trip).
- Amadeus sandbox has rate limits (~10 req/s). The in-memory cache on `/api/hotels/search` (1hr TTL, keyed by city+dates+guests) prevents redundant calls during a planning session.
