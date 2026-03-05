# Activity Intelligence - Phase 2-3 Enrichment and RAG Retrieval Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-02-26

## 1. Authoring Conformance

This spec follows:

- `AGENTS.md` -> `Architect`
- `SKILLS.md` -> `Technical Specification Authoring (Constraint-Driven)`

This spec assumes Phase 0-1 contracts are approved and implemented.

## 2. Scope

This specification defines implementation requirements for:

- Phase 2: enrichment, coverage, revalidation, and dedupe operations
- Phase 3: retrieval/RAG integration for planner inventory selection

### 2.1 Included

- Enrichment job execution semantics and idempotence
- Coverage thresholds as enforceable configuration
- External provider fallback policy during planning
- Retrieval service contract and ranking pipeline
- Planner integration contract for internal inventory retrieval
- Feature flags and rollout gates
- Metrics/logging requirements for enrichment and retrieval

### 2.2 Excluded

- Engagement score formula tuning (Phase 4)
- Pruning/archive job execution (Phase 4)
- Production cutover/runbooks (Phase 5)
- Orchestrator job-state correctness implementation (separate spec)

## 3. Current State (Contract)

- Planner currently relies heavily on provider calls and static/legacy host search paths.
- `docs/specs/god_tier_plan.md` defines target retrieval behavior but not executable contracts.
- `docs/production-deployment-checklist.md` identifies static host search and serverless runtime risks that constrain implementation.
- `Experience` already exists with embeddings in Prisma, but a unified `RetrievalDocument` path does not exist.

## 4. Phase 2 - Enrichment and Revalidation (Implementation Contract)

### 4.1 Desired Behavior

The system MUST maintain a city-scoped, provider-backed catalog of retrievable places with explicit coverage state. Enrichment MUST be durable, idempotent, and observable.

### 4.2 Enrichment Triggers (No Ambiguity)

The following triggers MUST enqueue `EnrichmentJob` records (not execute provider calls inline unless explicitly allowed):

1. `trip_request_city_coverage_check`
- Triggered when planner request references one or more cities
- Behavior: check latest `CityCoverageSnapshot`
- If threshold unmet or snapshot stale, enqueue `enrich_city`

2. `scheduled_revalidation`
- Triggered by cron/scheduler
- Behavior: enqueue `revalidate_city` for stale coverage/verification windows

3. `embedding_staleness`
- Triggered after retrieval document projection changes or embedding model/version changes
- Behavior: enqueue `reembed_city` or `rebuild_retrieval_docs`

4. `merge_remediation`
- Triggered by dedupe conflict detection or admin action
- Behavior: enqueue `merge_places`

### 4.3 Coverage Threshold Contract (Required)

Coverage thresholds MUST be implemented as versioned config data, not inline constants.

Required configuration shape:

- `coverageConfigVersion`
- `tiers[tier].minTotalActivePlaces`
- `tiers[tier].categoryMinimums[category]`
- `snapshotStaleAfterHours`
- `placeVerificationStaleAfterDays`
- `revalidationBatchSize`

Required categories for thresholding (minimum set):

- `landmark`
- `culture`
- `food`
- `outdoors`
- `nightlife`

Additional categories MAY be added only if they are included in the same config version and covered by tests.

### 4.4 Enrichment Job State Invariants

For each `EnrichmentJob`:

- `queued -> running -> succeeded|failed|cancelled` is the only valid status flow
- A leased `running` job MUST include `leaseOwner` and `leaseExpiresAt`
- A worker MUST NOT process a job without acquiring/refreshing a lease
- Reprocessing the same job after lease expiry MUST be idempotent
- A failed attempt MUST increment `attemptCount`
- A job MUST stop retrying when `attemptCount >= maxAttempts`

### 4.5 Provider Normalization and Merge Rules

All provider results MUST pass through Phase 1 domain functions. Implementation MUST NOT write provider payloads directly to `Place`.

Required write flow:

1. Fetch provider results
2. Normalize to `NormalizedPlaceCandidate`
3. Resolve city mapping
4. Upsert `PlaceSourceRecord`
5. Match/merge/update canonical `Place`
6. Project/update `RetrievalDocument` (or mark dirty for batch rebuild)
7. Update metrics on `EnrichmentJob`
8. Write `CityCoverageSnapshot`

### 4.6 Enrichment Idempotence Requirements

Re-running the same `enrich_city` job inputs MUST NOT:

- create duplicate `PlaceSourceRecord` rows for same provider entity
- create duplicate canonical `Place` rows for identical entities
- downgrade `verificationState` from `verified` to `unverified` without explicit invalidation reason
- clear existing engagement metrics

### 4.7 Planner-Time Fallback Policy (Mandatory, Bounded)

`docs/specs/god_tier_plan.md` states no external API calls during itinerary assembly. For production correctness, this spec defines a bounded fallback.

Planner retrieval behavior by city coverage:

1. **Coverage sufficient** (`meetsTierThreshold = true` and snapshot fresh)
- Planner MUST use internal retrieval only
- No provider place search during assembly

2. **Coverage insufficient but catalog has partial data**
- Planner MUST use internal retrieval first
- Planner MAY request bounded provider fallback enrichment for deficit categories only
- Fallback requests MUST be rate-limited and logged with `tripId`, `cityId`, deficit categories

3. **Coverage absent / stale beyond hard limit**
- Planner MAY use provider fallback for initial assembly
- Fallback MUST enqueue enrichment jobs to backfill catalog
- Planner response MUST tag provenance internally (for debug/analytics), even if UI does not expose it

Hard limit rule:

- Provider fallback MUST NOT exceed configured per-trip and per-city budgets (`maxFallbackCallsPerTrip`, `maxFallbackCallsPerCity`) in the same request lifecycle.

## 5. Phase 3 - Retrieval/RAG Integration (Implementation Contract)

### 5.1 Desired Behavior

Planner candidate selection MUST retrieve from internal inventory (`Place` + `Experience` projected to `RetrievalDocument`) using structured filters and semantic relevance. Retrieval MUST be deterministic in contract shape and observable.

### 5.2 Retrieval Service Contract (Required)

A single retrieval entrypoint MUST exist for planner usage.

Required input (logical contract):

- `tripId` (nullable for draft requests, but recommended)
- `requestId` / correlation ID
- `cities[]`
- `dateContext` (optional; season/time-of-year routing input)
- `budgetBand` (optional)
- `groupType` (optional)
- `pace` (optional)
- `preferences[]`
- `categoryHints[]`
- `limit`
- `entityTypes` (`place`, `experience`, or both)

Required output:

- `candidates[]` where each candidate includes:
  - `documentId`
  - `documentType`
  - `sourceEntityId`
  - `cityId`
  - `displayName`
  - `coordinates` (if applicable)
  - `primaryCategory`
  - `tags[]`
  - `retrievalScores` object:
    - `vectorSimilarity`
    - `filterBoost`
    - `engagementBoost` (may be 0 in Phase 3)
    - `noveltyBoost` (baseline value in Phase 3)
    - `finalScore`
  - `provenance` (`catalog` or `fallback_provider`)
- `coverageStatusByCity[]`
- `fallbackInvoked` bool
- `debug` payload (gated by env flag only)

### 5.3 Retrieval Pipeline (Required Order)

The retrieval pipeline MUST execute in this order:

1. Parse request intent into retrieval filters (city/category/price/etc)
2. Query active `RetrievalDocument` rows by structured filters
3. Run vector similarity on filtered subset (or hybrid lexical+vector depending backend)
4. Apply ranking fusion in the centralized ranking module
5. Apply diversity/duplication suppression rules (Phase 3 baseline only)
6. Return bounded candidate set and coverage/fallback metadata

Implementers MUST NOT call the LLM before retrieval candidate selection completes.

### 5.4 Vector Backend Selection Dependency

Phase 3 implementation MUST follow:

- `docs/specs/activity-intelligence-rag-vector-platform-options-spec.md`

No vector backend may be selected ad hoc during implementation. The decision record MUST cite benchmark results against the criteria in that spec.

### 5.5 Planner Integration Rules

Planner integration MUST be feature-flagged and reversible.

Required feature flags (exact names may vary, semantics may not):

- `planner_use_internal_retrieval`
- `planner_allow_provider_fallback_on_coverage_gap`
- `planner_log_retrieval_debug`

Planner integration MUST support the following modes:

1. `off`
- Existing behavior only

2. `shadow`
- Internal retrieval runs in parallel but planner still uses existing path
- Differences are logged/recorded for analysis

3. `assist`
- Planner uses internal retrieval candidates, fallback allowed per policy

4. `enforced`
- Planner must use internal retrieval for covered cities
- Provider fallback only via explicit deficit policy

### 5.6 Observability and Logging (Required)

Every retrieval call MUST emit structured logs with:

- `requestId`
- `tripId` (if present)
- `jobId` / `generationId` (if planner context available)
- `cities`
- `coverageState`
- `documentsFilteredCount`
- `documentsScoredCount`
- `returnedCount`
- `fallbackInvoked`
- `latencyMs` (total + major stages)
- `vectorBackend`
- `embeddingModel` / `embeddingVersion`

Metrics (required):

- retrieval latency p50/p95
- fallback rate by city tier
- zero-result rate
- duplicate suppression rate
- planner acceptance rate of candidates (Phase 4 may refine)

## 6. Constraints (Non-Negotiable)

### 6.1 Modularity

- Retrieval code MUST NOT query provider APIs directly except through the bounded fallback interface.
- Planner modules MUST NOT construct SQL/vector queries directly; they MUST call the retrieval service.
- Enrichment workers MUST NOT embed planner-specific ranking logic.

### 6.2 DRY

- One ranking fusion module for all planner retrieval callers
- One coverage evaluator used by enrichment scheduler and planner fallback policy
- One retrieval document projector used by both `Place` and `Experience`

### 6.3 Safety / Performance

- Retrieval MUST return within configured p95 target before LLM call (see vector options spec)
- Fallback provider usage MUST be budgeted and observable
- Debug payloads MUST be env-gated and excluded from default client responses

## 7. Interfaces and Side Effects (Explicit)

### 7.1 New/Updated Application Use Cases

Required use-cases (logical names):

- `ScheduleCityEnrichment`
- `RunEnrichmentJob`
- `RefreshCityCoverageSnapshot`
- `RebuildRetrievalDocuments`
- `EmbedRetrievalDocuments`
- `RetrievePlannerCandidates`
- `GetCoverageStatusForTripRequest`

### 7.2 Allowed Side Effects in Phase 2-3

- Provider API calls (enrichment + bounded fallback only)
- Catalog table writes (`Place*`, `CityCoverageSnapshot`, `EnrichmentJob`)
- Retrieval projection and embedding writes
- Structured logs and metrics emission

### 7.3 Prohibited Side Effects in Phase 2-3

- Direct writes to `Trip` itinerary tables from enrichment workers
- Planner runtime mutating catalog tables outside repository/application boundaries
- UI components directly reading vector backend APIs

## 8. Testing Requirements

### 8.1 Unit Tests (Required)

- coverage threshold evaluation and stale snapshot decisions
- fallback policy decisions (sufficient/partial/absent coverage)
- ranking fusion determinism given fixed scores
- diversity suppression baseline behavior
- enrichment job state transition validator

### 8.2 Integration Tests (Required)

- enrichment idempotence (same provider entities ingested twice)
- lease/retry behavior for `EnrichmentJob`
- retrieval query returns only active documents in requested city/category
- fallback budget enforcement (`maxFallbackCallsPerTrip`, `maxFallbackCallsPerCity`)
- retrieval feature-flag mode switching (`off`, `shadow`, `assist`, `enforced`)

### 8.3 E2E / Flow Tests (Required)

Because planner behavior is user-visible, implementers MUST add or update Playwright coverage for:

- planner request in a covered city (internal retrieval path)
- planner request in a low-coverage city (bounded fallback path)
- feature-flag rollback (`planner_use_internal_retrieval = false`)

### 8.4 Failure Conditions

Phase 2-3 implementation is invalid if:

- Provider fallback has no explicit budget limits
- Planner code bypasses the retrieval service and queries catalog/vector backend directly
- Coverage thresholds are hard-coded in multiple modules
- Retrieval output omits provenance/coverage metadata needed for debugging

## 9. Acceptance Criteria (Binary)

This phase spec is satisfied only if all are true:

- [ ] Enrichment jobs are durable, leased, idempotent, and observable
- [ ] Coverage thresholds are versioned config and drive both scheduling and fallback policy
- [ ] Planner retrieval uses a single service contract with feature-flagged rollout modes
- [ ] Provider fallback is bounded, logged, and triggered only under explicit coverage conditions
- [ ] Vector backend selection is delegated to and enforced by the dedicated options spec
- [ ] Tests cover enrichment idempotence, fallback policy, retrieval correctness, and user-visible planner flow impact

## 10. Out of Scope (Explicit)

The following are intentionally deferred to later phases:

- Personalized engagement weighting beyond baseline scores
- Automatic pruning/deletion of low-performing places
- Multi-tenant retrieval partitioning beyond city/category filters
- Cross-product reuse of retrieval service outside planner (search/browse can adopt later)
