# Technical Spec: Google Places Cost and Scaling Hardening Plan

**Status**: PROPOSED  
**Author**: Architect Agent  
**Date**: 2026-03-02  
**Input**: Deep architecture audit of Google Places integration and enrichment pipeline

## Related Specs
- `docs/specs/place-image-source-diversification-and-verification-spec.md` (authoritative detail for multi-provider image sourcing and relevance verification)

## 1. Objective
Reduce external Places dependency and prevent linear cost growth as usage approaches 100k users.

This spec defines mandatory architecture and implementation work to:
- enforce internal-first retrieval
- eliminate duplicate/avoidable external calls
- add durable cost telemetry and budget controls
- add staleness/refresh policy
- keep provider portability viable (Google is not a permanent lock-in)

## 2. Scope
### 2.1 In Scope
- Place resolution and enrichment pipeline (`resolve_place`, `geocodeCity`, image lookup endpoints).
- Google Routes call governance for itinerary route generation.
- Data model additions required for provider-agnostic place storage and cost telemetry.
- Runtime controls: dedupe locks, rate limits, budget guardrails, circuit breakers.
- KPI instrumentation for internal-hit vs external-call ratio.

### 2.2 Out of Scope
- Rewriting itinerary generation prompts.
- Replacing Google as provider in this phase.
- Rebuilding host semantic search into vector DB in this phase (integration hooks only).
- UI redesign.

## 3. Must-Not-Change Contracts
- Existing planner and trip creation flows MUST remain functionally equivalent for users.
- External provider failures MUST NOT block core UX; fallbacks must remain available.
- Existing route/page structure MUST NOT change as part of this work.

## 4. Non-Negotiable Invariants
1. Every Google Places and Google Routes call MUST pass through a single instrumented gateway layer.
2. No direct `fetch('https://places.googleapis.com/...')` or `fetch('https://routes.googleapis.com/...')` calls are allowed outside gateway modules.
3. Place enrichment MUST be internal-first:
   - exact provider alias match -> canonical place record
   - normalized text/context lookup -> canonical place record
   - vector/internal retrieval (if enabled) -> canonical place record
   - external provider only as last resort
4. Duplicate in-flight enrichment for the same normalized key MUST coalesce to one upstream call.
5. Place records MUST include staleness metadata and TTL behavior.
6. Every external call MUST emit durable telemetry with request correlation.
7. Runtime budget guards MUST be enforceable (warning + hard cap behavior).

## 5. Required Architecture Changes
### 5.1 Introduce Canonical Place Domain
Add canonical provider-agnostic place tables.

Required models:
- `Place`
  - `id` (cuid)
  - `canonicalName`
  - `normalizedName`
  - `formattedAddress`
  - `lat`, `lng`
  - `city`, `country`
  - `category`
  - `confidence`
  - `createdAt`, `updatedAt`
  - `lastValidatedAt`
  - `expiresAt`
- `PlaceProviderAlias`
  - `id`
  - `placeId` (FK -> `Place`)
  - `provider` (`GOOGLE_PLACES`, future providers)
  - `providerPlaceId`
  - `providerPayloadVersion`
  - unique index on `(provider, providerPlaceId)`
- `PlaceQueryCache`
  - normalized query key (name + context)
  - `placeId`
  - `createdAt`, `updatedAt`, `expiresAt`

Existing `PlaceCache` is transitional and MUST be migrated/deprecated after cutover.

### 5.2 Introduce External API Ledger
Add a durable table for every upstream call:
- `ExternalApiCall`
  - `id`
  - `provider` (`GOOGLE_PLACES`, `GOOGLE_ROUTES`)
  - `endpoint` (`places.searchText`, `places.photoMedia`, `routes.computeRoutes`, etc.)
  - `requestHash` (stable dedupe key)
  - `tripId`, `sessionId`, `userId` nullable
  - `statusCode`, `success`
  - `latencyMs`
  - `estimatedCostMicros`
  - `createdAt`

This table is mandatory for cost-per-session and cost-per-itinerary metrics.

### 5.3 Introduce Place Image Cache Persistence
Add `PlaceImageAsset`:
- `id`
- `placeId` (FK -> `Place`)
- `providerPhotoRef`
- `url`
- `width`, `height`
- `attributionJson`
- `createdAt`, `updatedAt`, `expiresAt`
- unique index on `(placeId, width, height, providerPhotoRef)`

In-memory image caches can remain as short-lived hot caches but cannot be the source of truth.

## 6. API and Service Layer Refactor
### 6.1 External Gateway Modules (Mandatory)
Create/standardize:
- `src/lib/providers/google-places-client.ts`
- `src/lib/providers/google-routes-client.ts`

Responsibilities:
- upstream fetch
- retries/backoff
- timeout
- telemetry emission (`ExternalApiCall`)
- budget enforcement pre-check

### 6.2 Place Resolution Service (Mandatory)
Create `PlaceResolutionService` and route all of:
- `resolve_place` tool
- `geocodeCity`
- image place lookup bootstrap
through it.

Service contract:
1. normalize query key
2. check canonical query cache
3. check provider alias by providerPlaceId if available
4. acquire in-flight lock (`key=normalizedQuery`, TTL 30s)
5. external call only if necessary
6. upsert canonical place + alias + query cache
7. return canonical place

### 6.3 Signed Access for Public Image Endpoints
`/api/images/places` and `/api/images/places/list` MUST enforce one of:
- authenticated user session, or
- short-lived HMAC signature generated server-side for first-party clients.

Unsigned public traffic MUST receive fallback image response without calling Google.

## 7. Staleness and Refresh Strategy
### 7.1 TTL Policy
- Place core geo/address/category TTL: 90 days.
- Place image asset TTL: 30 days.
- Query cache TTL: 30 days.

### 7.2 Refresh Behavior
- Serve stale data if present and schedule async refresh (`stale-while-revalidate`).
- Do not block user response for refresh unless no usable place exists.
- Batch refresh worker runs periodically for high-traffic places nearing expiry.

### 7.3 Revalidation Constraints
- No inline refresh on every read.
- Revalidation must be deduped by lock key.

## 8. Cost Control and Circuit Breakers
### 8.1 Required Budgets
Implement config-backed budgets:
- global daily provider budget
- per-user daily budget
- per-trip generation budget

### 8.2 Required Runtime Behavior
- Warning threshold at 80% budget consumption.
- Hard cap at 100%:
  - return cached data if available
  - otherwise return deterministic fallback with explicit `budget_exceeded` code

### 8.3 Rate Limiting
- Add explicit limiter to `/api/routes/compute`.
- Keep orchestrator rate limits, but move to user-scoped limits in addition to IP-scoped limits.

## 9. Internal Retrieval Priority and RAG Readiness
### 9.1 Mandatory Retrieval Ordering
For place resolution:
1. canonical DB exact query/alias
2. canonical DB fuzzy/normalized candidates
3. vector retrieval (if enabled)
4. Google Places external call

### 9.2 Required KPIs
Persist and monitor:
- `internal_place_hit_rate`
- `external_place_call_rate`
- `external_calls_per_itinerary`
- `external_cost_per_itinerary`
- `external_cost_per_session`

## 10. Autocomplete/Search Layer Requirements (Forward-Compatible)
The codebase currently does not implement Google autocomplete flows; these rules are mandatory before rollout of autocomplete UI:
- debounce: 300-500ms (default 400ms)
- one Google session token per typing session
- Place Details call only after user selection
- client-session cache for recent autocomplete queries
- no duplicate fetches on re-render/state churn

Autocomplete work is blocked until these controls are in place.

## 11. Implementation Phases
### Phase 0: Foundation Telemetry and Guardrails
Deliverables:
- `ExternalApiCall` model + migrations
- gateway clients for Places/Routes
- all Google calls routed through gateway
- `/api/routes/compute` rate limiting

Exit gate:
- Pass only if zero direct Google fetches remain outside gateway modules.
- Pass only if every external call writes one `ExternalApiCall` row.

### Phase 1: Canonical Place Domain Cutover
Deliverables:
- `Place`, `PlaceProviderAlias`, `PlaceQueryCache` models
- `PlaceResolutionService`
- `resolve_place` and `geocodeCity` migrated to service
- in-flight dedupe lock implemented

Exit gate:
- Pass only if concurrent identical requests (N=50) produce exactly one upstream call.
- Pass only if old and new resolution outputs match for regression test corpus.

### Phase 2: Image Pipeline Hardening
Deliverables:
- signed/auth gate for place image endpoints
- `PlaceImageAsset` persistence
- image endpoints read DB cache first
- provider chain: `UNSPLASH -> PEXELS -> GOOGLE_PLACES` with persisted verification status and relevance scores
- LLM adjudication for deterministic borderline candidates only

Exit gate:
- Pass only if unsigned requests never trigger Google calls.
- Pass only if repeated same-image requests hit DB/cache >90% in load test.

### Phase 3: TTL and Async Refresh
Deliverables:
- TTL fields + stale-while-revalidate logic
- refresh worker and queue
- no blocking refresh in request path

Exit gate:
- Pass only if stale records are served immediately and refreshed asynchronously.
- Pass only if refresh dedupe lock prevents duplicate upstream refreshes.

### Phase 4: Budget Controls and Circuit Breakers
Deliverables:
- budget config tables/env and enforcement middleware
- 80% warnings + 100% hard cap behavior
- dashboards for cost/session/itinerary

Exit gate:
- Pass only if synthetic budget exhaustion tests return deterministic fallback behavior.

### Phase 5: Retrieval KPI and Optimization
Deliverables:
- internal-vs-external KPI dashboards
- planner KPI reporting integrated into job lifecycle

Exit gate:
- Pass only if KPIs are queryable by day, environment, and release.

## 12. Test Requirements
### 12.1 Unit Tests
- query normalization determinism
- in-flight lock dedupe behavior
- TTL expiry and stale-while-revalidate behavior
- budget threshold and hard cap decisions
- signed image URL verification

### 12.2 Integration Tests
- `resolve_place` DB-first behavior before external fallback
- `geocodeCity` uses PlaceResolutionService (no direct Google calls)
- image endpoints use persisted cache before upstream calls
- `ExternalApiCall` written for every upstream interaction

### 12.3 Concurrency/Load Tests
- 50 parallel identical place lookups -> one upstream call
- 1000 repeated image requests for same place -> upstream call count remains bounded by cache miss rate target

### 12.4 E2E/Behavioral Tests
- itinerary generation still returns valid plan under budget-exceeded fallback mode
- trip creation and host draft flows still function when external provider unavailable

## 13. Binary Acceptance Criteria (Pass/Fail)
1. All Google upstream calls are gateway-mediated and ledgered.
2. `resolve_place` and `geocodeCity` are both served by the canonical place resolution service.
3. Canonical place schema is live and old `PlaceCache` is no longer primary read source.
4. In-flight dedupe prevents duplicate upstream calls for identical concurrent requests.
5. Place and image TTL policies are enforced with async refresh.
6. Image endpoints reject/short-circuit unsigned public traffic.
7. Budget warning and hard cap behavior is active and tested.
8. Internal-hit vs external-call KPIs are available and correct.
9. All required tests in Section 12 pass in CI.

If any criterion fails, rollout is incomplete.

## 14. Explicit Exclusions During Implementation
- No prompt redesign.
- No replacement of Google provider.
- No UI/UX overhaul.
- No vector DB vendor decision in this spec (only insertion points and KPI contract).
