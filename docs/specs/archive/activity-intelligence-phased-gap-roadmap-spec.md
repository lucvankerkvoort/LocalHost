# Activity Intelligence Layer - Phased Gap Roadmap Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-02-26

## 1. Authoring Conformance

This specification is authored under:

- `AGENTS.md` -> `Architect` operating contract
- `SKILLS.md` -> `Technical Specification Authoring (Constraint-Driven)`

This document is invalid unless used together with the phase specs referenced in Section 3.

## 2. Scope

This roadmap converts `docs/specs/god_tier_plan.md` from strategy language into an implementable, phased program.

This document defines:

- What is missing from `docs/specs/god_tier_plan.md`
- The mandatory implementation phase sequence
- Exit criteria for each phase
- Which companion spec governs each phase
- What must not change while each phase is underway

### 2.1 Included

- Data model gaps for activity/place intelligence
- Enrichment pipeline gaps (coverage, TTL, revalidation, provenance)
- Retrieval/RAG gaps (contracts, filters, vector backend selection)
- Engagement scoring and pruning gaps
- Migration, cutover, observability, and production-readiness gaps

### 2.2 Excluded

- Planner prompt rewrites
- Frontend progress bar implementation details (covered by `docs/specs/orchestrator-trip-readiness-and-persistence-alignment-spec.md`)
- Immediate bugfixes for current orchestrator write ordering (already tracked in other specs/plans)
- Product UX copy decisions outside of retrieval/persistence semantics

## 3. Companion Spec Set (Required)

Implementers MUST use the following documents together. This roadmap is not sufficient by itself.

1. `docs/specs/activity-intelligence-phase-0-1-foundation-and-domain-contracts-spec.md`
2. `docs/specs/activity-intelligence-phase-2-3-enrichment-and-rag-retrieval-spec.md`
3. `docs/specs/activity-intelligence-rag-vector-platform-options-spec.md`
4. `docs/specs/activity-intelligence-phase-4-5-engagement-pruning-and-rollout-spec.md`

## 4. Current State (Contract)

### 4.1 What Exists Today

- Strategy document: `docs/specs/god_tier_plan.md`
- Partial Prisma scaffold already exists in `prisma/schema.prisma`:
  - `City`
  - `Activity`
  - `PlaceCache`
  - `Experience` with embedding column
- Planner/orchestrator pipeline exists and currently has readiness/persistence coupling issues documented in:
  - `docs/specs/orchestrator-trip-readiness-and-persistence-alignment-spec.md`
- Production checklist exists and identifies serverless risks in:
  - `docs/production-deployment-checklist.md`

### 4.2 What the Current `god_tier_plan.md` Does Well (Keep)

The following strategy decisions are treated as preserved product intent unless explicitly overridden by a future spec:

- Internal inventory as a moat (not a generic directory)
- Tiered enrichment by city demand
- Engagement-aware ranking and pruning
- RAG retrieval from owned inventory
- Cost control via caching/revalidation and budget caps

### 4.3 What Is Missing (Gaps)

`docs/specs/god_tier_plan.md` is a strategy document, not an implementation spec. It does not currently define:

1. Canonical domain terminology that avoids collision between itinerary "activities" and catalog places
2. Source provenance model (provider payload lineage, confidence, normalized vs raw fields)
3. DB invariants (uniqueness, dedupe, soft-delete, merge, TTL, retention constraints)
4. Ownership boundaries (who writes what, where normalization occurs, where retrieval docs are built)
5. Enrichment job schemas and state transitions
6. Coverage thresholds as enforceable contracts (not examples only)
7. External-provider fallback rules for low-coverage cities during planning
8. RAG retrieval interfaces, ranking contract, and failure behavior
9. Vector backend decision criteria and migration path
10. Observability and audit requirements for silent data-quality failures
11. Backfill/cutover plan from current scaffold to production ownership model
12. Test matrix and binary acceptance criteria

## 5. Non-Negotiable Program Constraints

These constraints apply to all phases unless a later spec explicitly supersedes them.

### 5.1 DRY and Modularity Constraints

- There MUST be exactly one normalization pipeline for external place/provider data before persistence.
- There MUST be exactly one projection pipeline that builds retrieval documents for RAG.
- Planner-facing retrieval code MUST NOT duplicate embedding text composition logic.
- UI marker/title generation logic MUST NOT be reused as catalog normalization logic.
- Domain rules (dedupe, merge, coverage, pruning eligibility) MUST be implemented as pure functions in a domain module, not scattered across routes/jobs.

### 5.2 Data Ownership Constraints

- `Trip` and itinerary tables remain the source of truth for persisted trip state.
- Activity intelligence catalog tables MUST NOT become an implicit shadow trip store.
- Orchestrator job rows remain operational state, not canonical catalog state.

### 5.3 Safety / Compliance Constraints

- Provider caching/persistence policy MUST be codified before expanding Google-derived storage fields.
- Fields with restricted retention/reuse MUST be isolated and governed by policy metadata or omitted.
- No phase may assume all provider fields are legally cacheable indefinitely.

### 5.4 Production Constraints

- Phase design MUST remain compatible with serverless deployment constraints documented in `docs/production-deployment-checklist.md`.
- In-memory queues/caches may exist for optimization, but correctness MUST be guaranteed at the database boundary.

## 6. Phase Sequence (Mandatory)

Later phases MUST NOT begin implementation until prior phase exit criteria are met.

### Phase 0 - Foundation Contracts and Naming Decisions (P0)

**Primary output:** executable domain/spec decisions and migration boundaries.

**Missing items resolved in this phase:**

- Canonical terminology (`Place`, `PlaceSourceRecord`, `ItineraryItem` separation)
- Ownership boundaries (enrichment, retrieval, planner, trip persistence)
- Provider retention/compliance matrix placeholder and decision gate
- Initial observability contract for catalog/enrichment/retrieval pipelines
- Decision rubric for vector backend selection (spec only)

**Governing spec:**

- `docs/specs/activity-intelligence-phase-0-1-foundation-and-domain-contracts-spec.md` (Sections Phase 0)
- `docs/specs/activity-intelligence-rag-vector-platform-options-spec.md` (decision inputs only)

**Must NOT change in Phase 0:**

- Production planner runtime behavior
- Existing orchestrator/trip persistence flow
- Frontend progress/readiness semantics

**Exit criteria:**

- Phase 0 spec artifacts are approved and contain no unresolved implementer decisions
- All target entities and write owners are explicitly defined
- Vector backend decision criteria are explicit and benchmarkable

### Phase 1 - Catalog Schema and Domain Modules (P0)

**Primary output:** Prisma schema + domain modules + repository contracts for place intelligence catalog.

**Missing items resolved in this phase:**

- Canonical table set and constraints (uniqueness, dedupe markers, statuses)
- Provenance, confidence, and verification fields
- Enrichment job tables and state machine
- Retrieval document schema/materialization contract
- Index strategy (non-vector and vector placeholders)

**Governing spec:**

- `docs/specs/activity-intelligence-phase-0-1-foundation-and-domain-contracts-spec.md` (Sections Phase 1)

**Must NOT change in Phase 1:**

- Planner prompt/tool contracts
- Trip itinerary schema semantics (`Trip`, `TripAnchor`, `ItineraryDay`, `ItineraryItem`)
- UI rendering logic

**Exit criteria:**

- Schema migrations apply cleanly
- Domain invariants are unit-tested
- No direct planner dependency on new catalog tables yet (read-path can be dark-launched)

### Phase 2 - Enrichment, Coverage, and Revalidation Pipeline (P1)

**Primary output:** durable enrichment pipeline that fills and maintains catalog quality.

**Missing items resolved in this phase:**

- Coverage threshold enforcement by tier/category
- Enrichment job execution and retries
- TTL/revalidation policies
- Deduplication and merge handling
- Fallback policy for coverage gaps

**Governing spec:**

- `docs/specs/activity-intelligence-phase-2-3-enrichment-and-rag-retrieval-spec.md` (Sections Phase 2)

**Must NOT change in Phase 2:**

- Planner output assembly logic (except optional shadow reads for validation)
- Trip persistence behavior
- User-facing planner UX flow

**Exit criteria:**

- Catalog enrichment is reproducible for seeded cities
- Coverage snapshots are materialized and queryable
- Revalidation jobs update verification timestamps without duplicating places

### Phase 3 - Retrieval/RAG Integration and Vector Backend Adoption (P1/P2 depending scope)

**Primary output:** planner retrieval path that uses internal catalog/experience inventory with bounded fallback behavior.

**Missing items resolved in this phase:**

- Retrieval service contract (filters -> candidate retrieval -> rerank -> planner payload)
- Embedding generation and index population pipeline
- Vector backend selection and implementation
- Retrieval observability (latency, hit rate, fallback rate)
- Planner integration switch with feature flag and rollback path

**Governing specs:**

- `docs/specs/activity-intelligence-phase-2-3-enrichment-and-rag-retrieval-spec.md` (Sections Phase 3)
- `docs/specs/activity-intelligence-rag-vector-platform-options-spec.md`

**Must NOT change in Phase 3:**

- Orchestrator job state invariants defined elsewhere
- Trip DB schema semantics
- Existing host booking/payment flows

**Exit criteria:**

- Retrieval path passes benchmark targets and correctness tests
- Planner can assemble itineraries from internal inventory for covered cities
- Low-coverage fallback is explicit, bounded, and observable

### Phase 4 - Engagement Scoring, Pruning, and Personalization Signals (P2)

**Primary output:** closed-loop ranking and lifecycle management for catalog inventory.

**Missing items resolved in this phase:**

- Engagement event taxonomy and aggregation model
- Scoring formula/versioning
- Prune/archive eligibility rules
- Novelty/diversity signals for retrieval

**Governing spec:**

- `docs/specs/activity-intelligence-phase-4-5-engagement-pruning-and-rollout-spec.md` (Sections Phase 4)

**Must NOT change in Phase 4:**

- Core catalog identity/provenance model
- Retrieval API contract shape (only ranking inputs may expand)

**Exit criteria:**

- Score computation is reproducible and versioned
- Pruning is reversible (archive-first) and audited
- Retrieval ranking incorporates engagement without reducing correctness

### Phase 5 - Migration, Rollout, and Production Hardening (P0 release gate)

**Primary output:** safe cutover from strategy/scaffold to production-owned activity intelligence subsystem.

**Missing items resolved in this phase:**

- Backfill and cutover plan
- Operational dashboards/alerts
- Data integrity verification jobs
- Failure playbooks and rollback plan
- Production checklist alignment updates

**Governing spec:**

- `docs/specs/activity-intelligence-phase-4-5-engagement-pruning-and-rollout-spec.md` (Sections Phase 5)

**Must NOT change in Phase 5:**

- Public planner API request/response contracts unless separately specified
- Booking/payment/auth production flows unrelated to catalog rollout

**Exit criteria:**

- Cutover rehearsal passes
- Rollback procedure is validated
- Production alerts and integrity checks are active

## 7. Phase Dependencies (Explicit)

- Phase 1 depends on approved Phase 0 naming and ownership contracts.
- Phase 2 depends on Phase 1 schema and repository contracts being implemented.
- Phase 3 depends on Phase 2 enrichment pipeline and coverage snapshots.
- Phase 4 depends on Phase 3 retrieval path and event capture hooks.
- Phase 5 depends on Phases 1-4 implementation and operational telemetry.

## 8. Testing Requirements (Program-Level)

Every phase spec MUST define:

- Unit tests for domain rules introduced in that phase
- Integration tests for write/read contracts introduced in that phase
- E2E impact assessment for planner/user-visible changes
- Rollback verification requirements where production switches are introduced

No phase is complete if testing requirements are omitted or deferred without an explicit exception section.

## 9. Acceptance Criteria (Binary)

This roadmap spec is acceptable only if all conditions are true:

- [ ] Each missing area from Section 4.3 is assigned to exactly one phase owner/spec
- [ ] No phase asks implementers to infer schema names, ownership, or invariants
- [ ] DRY/modularity constraints are explicit and testable
- [ ] RAG/vector backend selection is governed by a separate decision spec with measurable criteria
- [ ] Phase sequencing and exit criteria are binary (not narrative-only)

## 10. Out of Scope (Roadmap Document)

This roadmap does not define:

- Exact Prisma migration SQL
- Exact embedding model vendor selection
- Exact provider-specific API field mappings
- Exact dashboard implementation details

Those are defined in the companion phase specs and implementation artifacts.
