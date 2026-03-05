# Activity Intelligence - RAG Vector Platform Options and Selection Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-02-26

## 1. Authoring Conformance

This spec follows:

- `AGENTS.md` -> `Architect`
- `SKILLS.md` -> `Technical Specification Authoring (Constraint-Driven)`

This document defines the allowed vector backend options and the mandatory selection process for Phase 3 in `docs/specs/activity-intelligence-phase-2-3-enrichment-and-rag-retrieval-spec.md`.

## 2. Scope

This specification defines:

- Approved architectural options for vector-backed RAG retrieval
- Required evaluation criteria and benchmark methodology
- Selection thresholds and default recommendation
- Operational constraints and migration paths

### 2.1 Included

- Vector storage options for `RetrievalDocument` semantic retrieval
- Metadata filtering and hybrid search architecture considerations
- Embedding storage strategy (inline vs reference)
- Operational/cost/latency tradeoffs
- Phase-appropriate recommendation (near-term vs scale-up)

### 2.2 Excluded

- Final vendor contract/procurement details
- Exact pricing numbers (these change and must be validated directly with vendors)
- Embedding model vendor selection (handled separately)
- Frontend/UI implementation

## 3. Current State (Contract)

- Prisma schema already includes vector columns on `Experience` and legacy `Activity` using `Unsupported("vector(1536)")`.
- There is no unified, production retrieval index for `Place + Experience`.
- `docs/specs/god_tier_plan.md` requires RAG over owned inventory but does not define backend selection.
- `docs/production-deployment-checklist.md` indicates serverless constraints and favors DB-backed correctness over in-memory behavior.

## 4. Non-Negotiable Requirements for Any Option

Every approved option MUST satisfy all requirements below.

### 4.1 Retrieval Capabilities

- Metadata filtering by at least: `cityId`, `documentType`, `primaryCategory`, `isActive`
- Semantic vector similarity over `RetrievalDocument` embeddings
- Support for incremental index updates (not full rebuild only)
- Ability to return stable document identifiers for deterministic joins back to source records

### 4.2 Operational Requirements

- Must support background re-embedding and reindexing without planner downtime
- Must provide a strategy for idempotent upserts and delete/disable propagation
- Must expose enough telemetry to measure p50/p95 latency and error rates
- Must be deployable in a way compatible with current hosting constraints (serverless app + managed DB/services)

### 4.3 DRY / Modularity Requirements

- Retrieval service code must talk to a `VectorStoreAdapter` interface (or equivalent), not vendor-specific SDKs throughout the codebase.
- `RetrievalDocument` projection format MUST remain vendor-agnostic.
- Metadata filtering logic MUST remain in the retrieval service layer, not in planner prompts/routes.

### 4.4 Performance Targets (Phase 3 Baseline)

These are selection gates for planner usage (pre-LLM retrieval path only):

- p95 retrieval latency <= 300 ms for `limit <= 50` on benchmark corpus
- p99 retrieval latency <= 600 ms on benchmark corpus
- Zero-result rate <= 2% for benchmark queries with sufficient catalog coverage
- Filter correctness = 100% for city/category/isActive constraints in integration tests

## 5. Approved Option Set (Only These Options Are In Scope)

The implementer MUST choose from the options in this section unless a new spec updates this file.

### Option A (Default Phase 3): Postgres + `pgvector`

#### 5A.1 Architecture

- Source of truth: PostgreSQL (same primary DB or a dedicated Postgres instance)
- Vector index: `pgvector` extension on retrieval document embeddings
- Metadata filters: native SQL (`WHERE cityId`, `documentType`, `category`, `isActive`)
- Hybrid retrieval: SQL filter + vector similarity (optionally combined with FTS via `tsvector`)

#### 5A.2 Where to Get It / How to Deploy

Approved deployment variants:

- Managed Postgres with `pgvector` support (e.g., Supabase, Neon Postgres with pgvector support, AWS RDS/Aurora Postgres if extension is supported in target plan)
- Self-managed Postgres only if operations ownership is explicitly staffed (not the default)

Implementers MUST confirm extension support in the target environment before selection.

#### 5A.3 Pros

- Simplest data ownership model (fewer moving parts)
- Strong transactional consistency with metadata and source records
- Easy Prisma/SQL integration for filters and joins
- Lowest architectural complexity for Phase 3

#### 5A.4 Cons

- Vector performance/scaling may degrade earlier than dedicated services
- Requires SQL and index tuning expertise for larger corpora
- Can compete with transactional workload if not isolated

#### 5A.5 Best Fit

Choose Option A if all are true:

- Corpus <= 2,000,000 active retrieval documents
- Sustained planner retrieval QPS <= 20
- Single-region deployment is acceptable
- Team prefers minimum operational surface area for first rollout

### Option B: Pinecone + Postgres Metadata Source of Truth

#### 5B.1 Architecture

- Source of truth: PostgreSQL (`RetrievalDocument` metadata)
- Vector index: Pinecone namespace(s)
- Metadata filtering: either Pinecone metadata filters (if mirrored) or prefilter in Postgres + vector lookup strategy (must be specified)
- Sync path: projection/embedding pipeline upserts vectors to Pinecone and stores `vectorRef`

#### 5B.2 Where to Get It / How to Deploy

- Managed Pinecone account (serverless or pod-based plan as selected by ops)
- Postgres remains required for canonical data and transactional state

#### 5B.3 Pros

- Managed scaling and operations for vector search
- Good fit for increasing corpus size and higher retrieval throughput
- Offloads vector workload from transactional Postgres

#### 5B.4 Cons

- Dual-write/sync complexity (Postgres + Pinecone)
- Additional operational/debugging surface area
- Metadata consistency bugs are easier to introduce if projection pipeline is not strict

#### 5B.5 Best Fit

Choose Option B if any are true and Option A benchmarks fail:

- Corpus > 2,000,000 active retrieval documents
- Sustained planner retrieval QPS > 20 or spiky workloads exceed Postgres latency targets
- Multi-region or managed scaling priorities outweigh dual-write complexity

### Option C: Qdrant (Managed Cloud Preferred) + Postgres Metadata Source of Truth

#### 5C.1 Architecture

- Source of truth: PostgreSQL (`RetrievalDocument` metadata)
- Vector index and payload filters: Qdrant collections (payload includes filter fields)
- Sync path: projection pipeline upserts payload + vectors to Qdrant and stores `vectorRef`

#### 5C.2 Where to Get It / How to Deploy

Approved deployment variants:

- Qdrant Cloud (preferred)
- Self-hosted Qdrant only with explicit ops ownership and backup plan

#### 5C.3 Pros

- Strong filtering + vector search model in one vector service
- Open-source portability (reduced vendor lock-in compared with fully managed-only services)
- Good operational middle ground if team is comfortable with one additional service

#### 5C.4 Cons

- Dual-write/sync complexity remains
- Operational burden if self-hosted
- Tooling/integration maturity may require more adapter work than Option A

#### 5C.5 Best Fit

Choose Option C if all are true:

- Option A fails latency targets on benchmark corpus
- Team wants service-level vector search with richer payload filtering
- Team can own an additional service adapter and operational runbooks

## 6. Selection Methodology (Mandatory)

The vector backend MUST be selected using this process. Implementation may not skip steps.

### 6.1 Benchmark Corpus Definition

Before benchmarking, create a representative benchmark corpus with:

- `RetrievalDocument` rows for both `place` and `experience`
- At least 10 Tier 1 cities, 20 Tier 2 cities, and 20 Tier 3 cities (or nearest available during early rollout)
- Category distribution matching expected planner usage
- Both dense cities and sparse cities
- Active and inactive documents for filter correctness tests

### 6.2 Query Set Definition

Create a benchmark query suite with at least:

- 50 covered-city queries
- 20 low-coverage queries
- 20 mixed-preference queries (budget + vibe + group type)
- 10 stress queries (broad city, large candidate pool)

Each query MUST have expected filter constraints and a minimum relevance sanity set (human-reviewed).

### 6.3 Metrics to Capture

For each option benchmark run, capture:

- p50/p95/p99 latency (end-to-end retrieval service)
- vector query time only
- filter stage time only
- error rate
- zero-result rate (when coverage sufficient)
- duplicate result rate
- operational complexity notes (setup time, sync failure modes)

### 6.4 Selection Rules (Binary)

1. Eliminate any option that fails filter correctness integration tests.
2. Eliminate any option that fails p95 or p99 targets in Section 4.4.
3. If Option A passes and corpus/QPS are within Section 5A.5 bounds, choose Option A.
4. If Option A fails and Option B and C both pass, choose based on operational ownership:
   - choose Option B when managed-service preference is primary
   - choose Option C when portability/control preference is primary and ops capacity is available
5. Record the decision in a dated ADR before implementation starts.

## 7. Adapter Contract (Required for DRY Modularity)

Implementers MUST define a single vector adapter interface used by retrieval services.

Required operations:

- `upsertDocuments(documents[])`
- `deleteDocuments(documentIds[])` or `deactivateDocuments(documentIds[])`
- `query(queryVector, filters, limit)`
- `healthCheck()`

The adapter MUST NOT expose vendor-specific concepts to planner code (e.g., namespaces/collections/index handles).

## 8. Embedding Storage and Sync Rules

### 8.1 Canonical Metadata Location

`RetrievalDocument` in Postgres remains canonical for:

- entity identity
- active/inactive status
- filter metadata
- quality/engagement/novelty scores
- embedding model/version metadata

### 8.2 Vector Payload Rules

- If using Option A, vector may be stored inline in Postgres (`pgvector`) on the retrieval document table or a companion table.
- If using Option B or C, vector service stores vector data and minimal filter payload; Postgres stores `vectorRef` and canonical metadata.
- Sync jobs MUST be idempotent and replayable.

### 8.3 Versioning Rules

- Re-embedding MUST use versioned `embeddingModel` + `embeddingVersion`.
- Queries MUST specify the active embedding version.
- Mixed-version retrieval in the same query is prohibited unless explicitly normalized and documented.

## 9. Testing Requirements

### 9.1 Required Integration Tests (Per Selected Option)

- adapter upsert/query/delete lifecycle
- metadata filter correctness (`cityId`, `documentType`, `category`, `isActive`)
- versioned query behavior (`embeddingVersion` mismatch handling)
- sync idempotence (repeat upsert produces no duplicate logical documents)

### 9.2 Required Benchmark Artifact

Implementers MUST commit or store (in CI artifacts/internal docs) a benchmark report containing:

- selected option
- benchmark corpus description
- query suite summary
- metrics table (latency/error/zero-result)
- failure modes observed
- final decision rationale referencing Section 6.4

### 9.3 Failure Conditions

Selection/implementation is invalid if:

- vendor choice is made without benchmark artifacts
- planner code depends directly on vendor SDKs
- metadata filters are split inconsistently between app code and vector service with no contract
- embedding versioning is not encoded in data and query logic

## 10. Acceptance Criteria (Binary)

This spec is satisfied only if all are true:

- [ ] Exactly one option from Section 5 is selected using Section 6 process
- [ ] Selection is documented with benchmark evidence and ADR
- [ ] Vector access is abstracted behind a single adapter interface
- [ ] `RetrievalDocument` remains canonical metadata source regardless of vector backend
- [ ] Integration tests validate filter correctness and sync idempotence for the selected option

## 11. Out of Scope (Explicit)

- Replacing Prisma with another ORM
- Provider-side managed RAG frameworks that bypass internal retrieval document ownership
- Cross-product search UI adoption outside planner
