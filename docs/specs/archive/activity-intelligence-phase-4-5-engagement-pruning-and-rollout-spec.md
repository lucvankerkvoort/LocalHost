# Activity Intelligence - Phase 4-5 Engagement, Pruning, and Rollout Spec

**Version:** 1.0
**Status:** Draft
**Last Updated:** 2026-02-26

## 1. Authoring Conformance

This spec follows:

- `AGENTS.md` -> `Architect`
- `SKILLS.md` -> `Technical Specification Authoring (Constraint-Driven)`

This spec assumes Phase 0-3 contracts are implemented or feature-flagged.

## 2. Scope

This specification defines:

- Phase 4: engagement signal capture, scoring, archival/pruning eligibility, ranking integration
- Phase 5: migration/cutover, production hardening, observability, and rollback for activity intelligence rollout

### 2.1 Included

- Engagement event taxonomy and aggregation model
- Scoring versioning and recomputation rules
- Archive/prune workflow and auditability
- Retrieval ranking integration of engagement/novelty signals
- Production rollout strategy and cutover gates
- Data integrity checks, dashboards, and alerts
- Rollback and recovery procedures

### 2.2 Excluded

- New product surfaces for browsing/search recommendations (unless needed for telemetry capture)
- Advanced personalization models (ML training pipelines) beyond rule-based scoring and novelty weights
- Full redesign of planner/orchestrator runtime

## 3. Current State (Contract)

- `Experience` and legacy `Activity` tables contain `engagementScore` fields, but a unified event-driven scoring pipeline is not defined.
- `docs/specs/god_tier_plan.md` describes engagement-based downranking/pruning at a strategy level but does not define event semantics, scoring versions, or archival safety.
- Production checklist (`docs/production-deployment-checklist.md`) identifies observability as a gap; this phase makes a subset of observability mandatory for rollout.

## 4. Phase 4 - Engagement and Pruning (Implementation Contract)

### 4.1 Desired Behavior

The system MUST capture planner and user interaction signals, aggregate them into reproducible engagement metrics, and use those metrics to inform retrieval ranking and archival eligibility without destructive data loss.

### 4.2 Engagement Event Taxonomy (Required)

A single engagement event schema MUST be used for both `Place` and `Experience` retrieval entities.

Required event types (minimum set):

- `retrieval_returned`
- `retrieval_selected_for_itinerary`
- `retrieval_not_selected`
- `itinerary_item_added`
- `itinerary_item_removed`
- `itinerary_item_reordered`
- `experience_booked`
- `experience_booking_failed` (optional for negative signal, if captured)
- `user_saved`
- `user_unsaved`
- `user_rated`
- `detail_viewed`

Required event fields:

- `eventId`
- `occurredAt`
- `userId` (nullable for anonymous contexts; current planner may require auth)
- `tripId` (nullable when not applicable)
- `jobId` / `generationId` (nullable but required for planner-originated events)
- `documentType` (`place` | `experience`)
- `sourceEntityId`
- `documentId` (`RetrievalDocument.id`)
- `cityId`
- `eventType`
- `eventValue` (nullable numeric payload, e.g., rating value)
- `context` JSON (bounded schema, versioned)

### 4.3 Aggregation Model (Required)

Phase 4 MUST introduce:

- `RetrievalEngagementDaily` (daily aggregates by `documentId`)
- `RetrievalEngagementAggregate` (rolling aggregate used by ranking)

Aggregation invariants:

- Aggregates MUST be reproducible from raw events for the retention window
- Re-running the same aggregation window MUST be idempotent
- Aggregation jobs MUST be versioned (`aggregationVersion`)
- Source event de-duplication MUST be enforced by `eventId`

### 4.4 Scoring Contract (Required)

Engagement scoring MUST be versioned and deterministic.

Required score outputs per document:

- `engagementScore`
- `qualityScore` (if recomputed here; otherwise carry-forward with explicit provenance)
- `noveltyPenalty` or `noveltyBoostInput`
- `scoreVersion`
- `scoreComputedAt`

Required scoring properties:

- Score calculation MUST be pure given aggregate inputs and config version
- Score output range MUST be normalized (defined min/max or clamped range)
- Negative events MUST not permanently zero out a document without archive workflow

### 4.5 Archive vs Prune Semantics (No Destructive Deletes by Default)

This spec defines a two-step lifecycle:

1. `archive`
- Document/place remains in DB with `status = archived` / `isActive = false`
- Excluded from default retrieval
- Recoverable without data loss

2. `prune` (optional later)
- Physical deletion or heavy payload removal only after retention policy and audit checks
- Not required for initial Phase 4 completion

Required rules:

- Phase 4 MUST implement archive-first, not delete-first
- Any archival action MUST write an audit record with reason and score snapshot
- Manual override MUST be possible for `suppressed` vs `archived`

### 4.6 Ranking Integration Rules

Phase 4 retrieval ranking MUST incorporate engagement and novelty as additive inputs through the centralized ranking module only.

Prohibited behavior:

- Planner-specific ranking hacks based on direct event counts
- Separate ranking formulas for `Place` and `Experience` unless explicitly versioned and documented in the same module

### 4.7 Bias and Safety Constraints

Implementers MUST enforce safeguards so engagement does not collapse variety:

- Category floor: retrieval should not eliminate entire categories solely due to low engagement
- New-item cold start baseline: newly added documents receive neutral prior score
- City-tier normalization: low-volume Tier 3 cities are not penalized by absolute event count compared with Tier 1 cities

## 5. Phase 5 - Migration, Cutover, and Production Hardening (Implementation Contract)

### 5.1 Desired Behavior

The activity intelligence subsystem MUST be deployed with reversible rollout controls, integrity checks, and operational visibility. Planner correctness MUST not depend on silent assumptions about catalog freshness or vector sync.

### 5.2 Cutover Strategy (Mandatory Sequence)

Cutover MUST follow this order:

1. `schema_ready`
- Phase 1 migrations deployed
- Phase 2/3 workers and retrieval service deployable behind flags

2. `shadow_population`
- Enrichment and retrieval document projection run in background
- Planner continues legacy path
- Data quality and coverage monitored

3. `shadow_retrieval`
- Planner invokes internal retrieval in shadow mode and logs diff vs legacy behavior
- No user-visible behavior change

4. `assist_mode`
- Feature flag enables internal retrieval + bounded fallback for a subset of traffic/users/cities

5. `enforced_mode`
- Internal retrieval becomes default for covered cities
- Fallback remains bounded per policy

6. `legacy_deprecation`
- Legacy paths (`Activity` scaffold reads, static host search path for planner where replaced) are disabled only after verification

### 5.3 Rollback Requirements

Phase 5 MUST define and verify rollback for:

- retrieval path regression (switch `planner_use_internal_retrieval` off)
- vector backend outage (fallback to legacy planner retrieval path or bounded provider calls)
- enrichment worker failure (planner continues with existing catalog snapshots)
- bad scoring deployment (revert `scoreVersion` / ranking config)

Rollback MUST be executable without schema rollback for at least one release window.

### 5.4 Data Integrity Checks (Required)

Automated checks MUST run on a schedule and/or deployment gate for:

- `RetrievalDocument` rows with missing active source entity (`Place` / `Experience`)
- Active documents missing embeddings for the active embedding version
- `Place` rows with no `PlaceSourceRecord`
- Duplicate canonical place candidates above merge threshold but unresolved beyond SLA
- City coverage snapshots stale beyond configured threshold for top-tier cities
- Archived/suppressed documents still returned by retrieval integration tests (should fail)

### 5.5 Observability and Alerts (Required for Production Gate)

Required dashboards/alerts before Phase 5 completion:

- retrieval latency (p50/p95/p99) and error rate
- fallback invocation rate by city tier
- enrichment job queue depth and failure rate
- vector sync failures / embedding failures
- zero-result rate for covered cities
- integrity check failures

Alert thresholds MUST be documented and actionable (who responds, what first step is).

### 5.6 Production Checklist Alignment (Required Update)

Phase 5 implementation MUST update `docs/production-deployment-checklist.md` with a new blocker or pre-launch item covering:

- activity intelligence catalog integrity and retrieval readiness
- vector backend operational readiness (backups, monitoring, quotas)
- planner fallback behavior when retrieval backend is degraded

## 6. Constraints (Non-Negotiable)

### 6.1 DRY / Modularity

- Event ingestion for engagement MUST use one event schema and one ingestion API/module.
- Scoring logic MUST be centralized and versioned.
- Archive/prune rules MUST be centralized; no ad hoc SQL deletes in jobs/scripts.

### 6.2 Data Safety

- No destructive pruning without archive history and audit trail
- No score-driven deletion in the same job that computes scores
- Manual/admin overrides MUST be recorded and reversible

### 6.3 Rollout Safety

- Feature flags MUST gate planner retrieval path changes
- Rollback path MUST be tested before `enforced_mode`
- Phase 5 completion is blocked if integrity checks are not automated

## 7. Interfaces and Side Effects (Explicit)

### 7.1 Required Use Cases / Jobs

- `RecordRetrievalEngagementEvent`
- `AggregateRetrievalEngagementDaily`
- `RecomputeRetrievalScores`
- `ArchiveLowPerformingDocuments`
- `RunCatalogIntegrityChecks`
- `RunRetrievalShadowDiffAnalysis`

### 7.2 Allowed Side Effects

- Writes to engagement event and aggregate tables
- Updates to `RetrievalDocument` ranking fields/statuses
- Archive-state updates to `Place` / `RetrievalDocument`
- Structured logs, metrics, alerts, and integrity reports

### 7.3 Prohibited Side Effects

- Deleting `Place` / `Experience` rows as part of score computation
- Planner runtime directly mutating engagement aggregates
- UI-triggered direct writes to scoring tables (must go through ingestion API/use-case)

## 8. Testing Requirements

### 8.1 Unit Tests (Required)

- event normalization and de-duplication
- score computation determinism across versions
- archive eligibility rules (including safeguards)
- ranking fusion with engagement + novelty inputs

### 8.2 Integration Tests (Required)

- end-to-end event -> aggregate -> score recompute pipeline
- archive-first behavior (no hard delete)
- rollback of scoring config/version
- integrity checks detect broken states listed in Section 5.4
- feature-flag transitions (`shadow`, `assist`, `enforced`, rollback)

### 8.3 E2E / Flow Tests (Required)

Because planner retrieval becomes user-visible, Playwright coverage MUST include:

- planner flow in `assist_mode`
- planner flow in `enforced_mode`
- emergency rollback to legacy retrieval path

### 8.4 Failure Conditions

Implementation is invalid if:

- engagement scoring is non-versioned or non-deterministic
- pruning performs hard deletes before archive/audit
- rollout lacks tested rollback steps
- integrity checks exist only as manual scripts

## 9. Acceptance Criteria (Binary)

This phase spec is satisfied only if all are true:

- [ ] Engagement events, aggregates, and scores are versioned and reproducible
- [ ] Archive-first lifecycle is implemented and audited before any pruning
- [ ] Retrieval ranking integrates engagement/novelty only through centralized ranking logic
- [ ] Cutover proceeds through `shadow -> assist -> enforced` with explicit rollback gates
- [ ] Automated integrity checks and alerts are production-enabled before final cutover
- [ ] Production deployment checklist is updated with activity intelligence readiness items

## 10. Out of Scope (Explicit)

- Training custom ML ranking models
- Real-time personalization pipelines beyond rules/config
- Cross-surface recommendation systems unrelated to planner
- Legal/compliance policy authoring (must already exist from Phase 0 gate)
