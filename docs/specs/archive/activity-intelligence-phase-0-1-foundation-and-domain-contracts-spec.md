# Activity Intelligence - Phase 0-1 Foundation and Domain Contracts Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-02-26

## 1. Authoring Conformance

This spec follows:

- `AGENTS.md` -> `Architect`
- `SKILLS.md` -> `Technical Specification Authoring (Constraint-Driven)`

This spec is implementation-facing. It is not a product strategy document.

## 2. Scope

This specification defines the required foundation and database/domain contracts for Phase 0 and Phase 1 of the Activity Intelligence Layer program.

### 2.1 Included

- Canonical terminology and naming decisions
- Bounded contexts and ownership model (DRY/module boundaries)
- Target data model (Phase 1 schema) for place intelligence catalog
- Provenance, confidence, verification, and dedupe semantics
- Enrichment job tables and lifecycle states (schema-level only)
- Retrieval document projection contract (schema + interfaces only)
- Required indexes and uniqueness constraints
- Migration and compatibility rules from existing `City` / `Activity` scaffold
- Test requirements and binary acceptance criteria

### 2.2 Excluded

- Implementation of enrichment workers/jobs (Phase 2)
- Planner retrieval integration (Phase 3)
- Engagement scoring algorithms (Phase 4)
- Production rollout/cutover operations (Phase 5)
- Orchestrator/job-progress bugfix implementation (covered elsewhere)

## 3. Current State (Contract)

### 3.1 Existing Prisma Scaffold (Must Be Acknowledged)

`prisma/schema.prisma` already contains:

- `City`
- `Activity`
- `PlaceCache`
- `Experience` with `embedding`

The existence of these tables is treated as a migration input, not proof that the domain model is complete.

### 3.2 Existing Naming Ambiguity (Must Be Corrected)

The codebase already uses "activity" to mean at least two different concepts:

- Planner itinerary items (trip activities in a day)
- Catalog locations (`Activity` table)

This ambiguity is a correctness and maintainability risk and MUST be removed at the domain/spec layer in Phase 0.

### 3.3 What Must Not Change in Phase 0-1

- `Trip`, `TripAnchor`, `ItineraryDay`, `ItineraryItem` semantics
- Existing planner/orchestrator UI behavior
- Booking/payment/auth flows
- Existing `Experience` user-facing contracts (except additive catalog integration fields)

## 4. Phase 0 Decisions (Mandatory)

Phase 0 is complete only when all decisions below are documented and approved. Implementers MUST NOT start schema implementation before Phase 0 completion.

### 4.1 Canonical Domain Terms (No Alternatives)

Implementers MUST use the following terms in code, comments, tests, and docs.

- `Place`: Canonical real-world location entity used by planner retrieval and itinerary suggestions.
- `PlaceSourceRecord`: Provider-specific source payload and provenance for a `Place` (Google Places, curated, user import, etc.).
- `PlaceEmbedding`: Embedding record for a `Place` for semantic retrieval (versioned).
- `Experience`: Host-created or platform-managed bookable experience (existing table remains canonical for this concept).
- `RetrievalDocument`: Materialized retrieval unit consumed by RAG (may represent a `Place` or an `Experience`).
- `City`: Geographic demand/coverage grouping entity for enrichment planning.
- `ItineraryItem`: Trip-specific scheduled item in user itineraries (existing meaning, unchanged).

### 4.2 Prohibited Terms / Usage

- Implementers MUST NOT use `Activity` as the canonical domain term for places in new modules.
- Implementers MUST NOT reuse `ItineraryItem` types as catalog entities.
- Implementers MUST NOT refer to `OrchestratorJob.plan` as catalog inventory.

### 4.3 Bounded Contexts (Ownership Model)

The system MUST be split into the following bounded contexts. Each context has a single write owner.

1. `place_intel_catalog` (new)
- Owns: `Place`, `PlaceSourceRecord`, `PlaceEmbedding`, `CityCoverageSnapshot`, dedupe/merge state
- Write owner: enrichment pipeline + curation tools only

2. `experience_catalog` (existing + integrated)
- Owns: `Experience`, `ExperienceAvailability`
- Write owner: host/product/admin flows

3. `retrieval_index` (new projection context)
- Owns: `RetrievalDocument` (or equivalent materialized view/table), embedding index population jobs
- Write owner: projection builder only

4. `trip_planning_runtime` (existing)
- Owns: `OrchestratorJob`, planner sessions, runtime plan state
- Write owner: planner/orchestrator runtime only

5. `trip_persistence` (existing)
- Owns: `Trip`, `TripAnchor`, `ItineraryDay`, `ItineraryItem`
- Write owner: trip persistence actions/routes only

### 4.4 DRY / Modularity Constraints (Mandatory)

#### DRY-01 Normalization

All provider payload normalization MUST occur in exactly one module family:

- `src/lib/place-intel/domain/*` (pure rules/types)
- `src/lib/place-intel/application/*` (use-cases)
- `src/lib/place-intel/infrastructure/providers/*` (provider adapters)

No API route, planner tool, or UI component may normalize provider place payloads directly.

#### DRY-02 Retrieval Projection

There MUST be exactly one retrieval document projector used for both:

- `Place` -> `RetrievalDocument`
- `Experience` -> `RetrievalDocument`

Embedding text composition MUST be centralized and versioned.

#### DRY-03 Ranking Inputs

Similarity score fusion, engagement weighting, and novelty weighting MUST be implemented in a single ranking module. Planner routes MUST NOT recompute ranking weights ad hoc.

#### DRY-04 City Coverage

Coverage thresholds and category minimums MUST be defined in one configuration module and reused by:

- enrichment scheduling
- coverage reporting
- fallback decision logic

## 5. Phase 1 Target Data Model (Schema Contract)

This section defines the required target schema semantics. Implementers MAY choose exact Prisma field names if and only if they preserve the contracts below. Where exact names are mandated, they are marked `REQUIRED NAME`.

### 5.1 Migration Strategy (Mandatory)

Phase 1 MUST use a non-destructive migration path:

1. Create new tables for canonical place intelligence model.
2. Keep existing `City` and `Activity` tables intact during Phase 1.
3. Mark old `Activity` table as legacy in internal docs/comments.
4. Do not repurpose existing `Activity` rows as canonical `Place` without explicit backfill logic and verification.

Rationale: avoids conflating incomplete scaffold data with production contracts.

### 5.2 Required Tables (Canonical)

#### 5.2.1 `Place` (REQUIRED NAME)

Purpose: canonical normalized place entity used for planning/retrieval.

Required fields:

- `id` (stable primary key)
- `cityId` (FK to `City`)
- `canonicalName`
- `normalizedName` (case/whitespace/diacritics normalized for dedupe)
- `lat`
- `lng`
- `primaryCategory`
- `secondaryCategories` (array/json; optional but recommended)
- `formattedAddress` (nullable)
- `countryCode` (ISO code; required)
- `locality` (nullable string; city/neighborhood label from source)
- `status` enum: `active | archived | merged | suppressed`
- `verificationState` enum: `unverified | verified | stale | invalid`
- `confidenceScore` (0..1 normalized)
- `sourcePriority` (numeric tie-break for canonical selection)
- `engagementScore` (float, default baseline; Phase 4 starts using it)
- `firstSeenAt`
- `lastVerifiedAt` (nullable until first verification)
- `createdAt`
- `updatedAt`

Required constraints:

- Unique constraint on canonical identity key (see 5.4)
- Index on `cityId`
- Index on `primaryCategory`
- Index on `status`
- Index on `verificationState`
- Composite index on `(cityId, status, primaryCategory)`

#### 5.2.2 `PlaceSourceRecord` (REQUIRED NAME)

Purpose: provider-specific provenance record linked to a `Place`.

Required fields:

- `id`
- `placeId` (FK to `Place`)
- `provider` enum/string (`google_places`, `curated`, `user_import`, future providers)
- `providerEntityId` (nullable only for providers without stable IDs)
- `providerVersion` (nullable string for schema version/payload format)
- `providerUpdatedAt` (nullable)
- `rawPayload` (JSON; gated by retention policy)
- `normalizedSnapshot` (JSON; normalized fields used to derive `Place`)
- `fieldProvenance` (JSON map: field -> source/confidence)
- `retentionPolicyKey` (string; links to provider policy definition)
- `isCanonicalSource` (bool)
- `ingestedAt`
- `lastSeenAt`
- `createdAt`
- `updatedAt`

Required constraints:

- Unique `(provider, providerEntityId)` when `providerEntityId` is present
- At most one `isCanonicalSource = true` per `placeId` (enforced via partial unique index or application invariant test if DB cannot express partial unique)

#### 5.2.3 `PlaceEmbedding` (REQUIRED NAME)

Purpose: versioned embeddings for semantic retrieval.

Required fields:

- `id`
- `placeId` (FK)
- `embeddingModel` (e.g., `text-embedding-3-small`)
- `embeddingVersion` (project-controlled version string)
- `embeddingDimensions`
- `embeddingVector` (backend-specific vector type or external reference)
- `inputHash` (hash of embedding source text)
- `sourceTextVersion` (projector version)
- `status` enum: `ready | stale | failed | pending`
- `errorCode` (nullable)
- `createdAt`
- `updatedAt`

Required constraints:

- Unique `(placeId, embeddingModel, embeddingVersion)`
- Index on `status`

#### 5.2.4 `CityCoverageSnapshot` (REQUIRED NAME)

Purpose: materialized coverage summary used for enrichment decisions and reporting.

Required fields:

- `id`
- `cityId` (FK)
- `snapshotAt`
- `coverageVersion` (threshold config version)
- `totalActivePlaces`
- `countsByCategory` (JSON object)
- `verifiedCoverageRatio`
- `staleCoverageRatio`
- `meetsTierThreshold` (bool)
- `deficitCategories` (JSON array)
- `generatedByJobId` (nullable FK to enrichment job)

Required constraints:

- Index on `(cityId, snapshotAt DESC)`
- Index on `meetsTierThreshold`

#### 5.2.5 `EnrichmentJob` (REQUIRED NAME)

Purpose: durable tracking for city/category enrichment and revalidation work.

Required fields:

- `id`
- `jobType` enum: `enrich_city | revalidate_city | reembed_city | rebuild_retrieval_docs | merge_places`
- `cityId` (nullable for global jobs)
- `status` enum: `queued | running | succeeded | failed | cancelled`
- `priority` (int)
- `requestedBy` enum: `system | user_trip_request | admin | migration`
- `triggerContext` JSON (tripId/requestId/etc)
- `targetCategories` JSON array
- `attemptCount`
- `maxAttempts`
- `leaseOwner` (nullable)
- `leaseExpiresAt` (nullable)
- `startedAt` (nullable)
- `completedAt` (nullable)
- `errorCode` (nullable)
- `errorMessage` (nullable, truncated)
- `metrics` JSON (added/updated/merged/skipped counts)
- `createdAt`
- `updatedAt`

Required constraints:

- Index on `(status, priority, createdAt)`
- Index on `(cityId, jobType, status)`

#### 5.2.6 `RetrievalDocument` (REQUIRED NAME)

Purpose: materialized, filterable retrieval unit for RAG. One row per retrievable unit (place or experience).

Required fields:

- `id`
- `documentType` enum: `place | experience`
- `sourceEntityId` (FK-by-convention to `Place.id` or `Experience.id`)
- `cityId` (nullable for non-city-specific docs; default required for current scope)
- `countryCode`
- `primaryCategory`
- `secondaryCategories` JSON array
- `priceBand` (nullable normalized enum/int)
- `tags` JSON array
- `qualityScore` (float)
- `engagementScore` (float)
- `noveltyScore` (float baseline default)
- `isActive` (bool)
- `filterPayload` JSON (strictly non-embedding retrieval fields)
- `embeddingSourceText` (text or hashed reference; see vector backend option spec)
- `embeddingStatus` enum: `pending | ready | stale | failed`
- `embeddingModel`
- `embeddingVersion`
- `vectorRef` (nullable; exact meaning depends on vector backend option)
- `documentVersion`
- `projectedAt`
- `createdAt`
- `updatedAt`

Required constraints:

- Unique `(documentType, sourceEntityId, documentVersion)`
- Active lookup index on `(documentType, cityId, isActive)`
- Index on `(embeddingStatus, embeddingModel, embeddingVersion)`

### 5.3 Existing `City` Table Handling

Two conceptual migration paths exist (`reuse City` vs `introduce PlaceCity`), but this specification mandates the first path to minimize migration churn.

Phase 1 MUST reuse the existing `City` table as canonical `City`.

Required additions/changes to existing `City` semantics:

- `tier` remains canonical tier indicator
- `lastEnrichedAt`, `enrichmentScore`, `activityCount` are treated as cached summary fields only (not source of truth)
- Coverage truth MUST come from `CityCoverageSnapshot`, not denormalized counters alone

### 5.4 Canonical Place Identity and Dedupe Contract

Implementers MUST define and use the following identity strategy exactly.

#### 5.4.1 Provider Identity

If a provider supplies a stable entity ID (`providerEntityId`), that identity is authoritative for source record uniqueness.

#### 5.4.2 Canonical Place Identity Key (Application-Level)

Canonical dedupe candidate key MUST be derived from:

- `cityId`
- `normalizedName`
- geospatial bucket (grid/hash precision defined in config)
- `primaryCategory`

This key is used for candidate matching only. It MUST NOT be treated as proof of duplication.

#### 5.4.3 Merge Decision

A merge MUST require an explicit merge decision function using:

- name similarity
- distance threshold
- category compatibility
- provider identity conflicts

Merged places MUST retain lineage via a merge/audit record (Phase 2 implementation, schema stub allowed in Phase 1 if preferred).

### 5.5 Provider Retention / Compliance Gate (Mandatory)

Before storing expanded provider payloads in `rawPayload`, Phase 0 MUST produce a provider retention policy matrix (internal artifact/ADR is acceptable) with at least:

- provider name
- allowed stored fields
- disallowed fields
- retention duration
- revalidation requirements
- attribution requirements

Phase 1 implementation MUST block storage of fields not approved by the matrix.

## 6. Interfaces and Contracts (Phase 0-1)

These interfaces MUST exist by the end of Phase 1 (exact file names may vary, but boundaries may not).

### 6.1 Domain Interfaces (Pure)

- `normalizePlaceSource(input) -> NormalizedPlaceCandidate`
- `computePlaceDedupeKey(placeCandidate) -> string`
- `evaluatePlaceMergeCandidate(existing, incoming) -> MergeDecision`
- `computeCityCoverage(snapshotInput, thresholds) -> CityCoverageResult`
- `buildRetrievalDocument(entity) -> RetrievalDocumentPayload`
- `buildEmbeddingSourceText(entity, projectorVersion) -> { text, hash }`

These functions MUST be pure and unit-tested.

### 6.2 Repository Interfaces

- `PlaceRepository`
- `PlaceSourceRecordRepository`
- `PlaceEmbeddingRepository`
- `CityCoverageSnapshotRepository`
- `EnrichmentJobRepository`
- `RetrievalDocumentRepository`

Repository interfaces MUST NOT expose provider-specific DTOs directly.

### 6.3 Side Effects (Explicit)

Phase 1 side effects are limited to:

- Prisma schema migrations
- Backfill/migration scripts for schema initialization (if needed)
- Creation and update of catalog/projection rows only

Phase 1 MUST NOT write to:

- `Trip*` tables
- `OrchestratorJob`
- planner session state

## 7. Testing Requirements (Phase 0-1)

### 7.1 Unit Tests (Required)

Implementers MUST add unit tests for:

- place normalization (including missing optional fields)
- dedupe key generation stability
- merge decision edge cases (nearby duplicates vs distinct places)
- coverage threshold evaluation by city tier
- retrieval document projection (place and experience variants)
- embedding source text builder determinism (same input -> same hash)

### 7.2 Integration Tests (Required)

Implementers MUST add integration tests for:

- Prisma uniqueness constraints (`PlaceSourceRecord`, `PlaceEmbedding`, `RetrievalDocument`)
- non-destructive migration path alongside legacy `Activity` table
- city coverage snapshot insertion/querying

### 7.3 E2E Impact Assessment (Required)

Phase 1 is expected to be non-user-facing. Implementers MUST document E2E impact as:

- `No user-facing flow changed` OR
- enumerate any admin/seed tooling UI touched and add minimal Playwright coverage

### 7.4 Failure Conditions (Spec Enforcement)

Phase 1 implementation is invalid if:

- New modules still use `Activity` as canonical term for place intelligence domain types
- Provider normalization logic appears in route handlers or planner modules
- Retrieval document projection logic is duplicated for `Place` and `Experience`
- Legacy `Activity` table is repurposed without migration validation plan

## 8. Acceptance Criteria (Binary)

This phase spec is satisfied only if all are true:

- [ ] Phase 0 naming, ownership, and retention-policy gate are documented and approved
- [ ] Canonical Phase 1 schema includes `Place`, `PlaceSourceRecord`, `PlaceEmbedding`, `CityCoverageSnapshot`, `EnrichmentJob`, and `RetrievalDocument`
- [ ] Legacy `City`/`Activity` scaffold handling is explicitly defined and non-destructive
- [ ] Dedupe/provenance/coverage/retrieval contracts are specified with testable invariants
- [ ] DRY/module boundaries are explicit enough that implementers cannot place logic in planner/UI/routes ad hoc
- [ ] Test requirements cover both pure domain rules and DB constraints

## 9. Out of Scope (Explicit)

The following tempting tasks are explicitly deferred:

- Wiring planner retrieval to `RetrievalDocument`
- Building a vector index service
- Engagement event ingestion and ranking weights
- Automatic pruning jobs
- Replacing existing static host search in this phase
