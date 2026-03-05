# Refactor/Deployment-Ready Branch Remediation Priority Plan Spec

**Version:** 1.1
**Status:** Draft
**Last Updated:** 2026-02-26

## 1. Authoring Conformance

This specification is authored under:

- `AGENTS.md` -> `Architect`
- `SKILLS.md` -> `Technical Specification Authoring (Constraint-Driven)`

Authoring note:

- The `Architect` operating contract requires the `Technical Specification Authoring (Constraint-Driven)` skill.
- That skill was not present in the active skill inventory for this session.
- This specification is therefore authored directly to the `AGENTS.md` `Architect` constraints and the same constraint-driven output requirements (explicit scope, invariants, tests, binary acceptance criteria).

This document translates code-review findings on branch `refactor/deployment-ready` into an implementation plan prioritized by P-level severity.

## 2. Problem Statement

The current branch introduces valuable architecture changes (backend trip persistence extraction, orchestrator generation guards, activity-intelligence scaffolding, RAG retrieval integration), but it also introduces or leaves unresolved correctness risks that block production readiness.

The highest-risk issues are:

- unsafe Prisma migration artifact(s)
- non-atomic orchestrator job state protections (still race-prone in serverless/multi-invocation conditions)
- refine-path orchestrator write bypasses without generation scoping
- global inventory retrieval injected into planner without city scoping
- inventory `placeId` not used during hydration (RAG identity contract is not enforced)
- backend planner persistence path bypassing route-level ownership checks

This specification defines the required remediation sequence and verification gates.

## 3. Scope

### 3.1 Included

- Orchestrator job state correctness and generation-scoped write behavior
- Planner refine-path write semantics (`onQueued`, flush, completion)
- Backend trip persistence ownership/authorization contract for planner writes
- RAG inventory retrieval scoping and planner integration correctness
- Migration hygiene for the newly introduced activity/RAG changes
- Enrichment accounting correctness (`City.activityCount`)
- Request-path enrichment latency containment strategy
- Required tests and rollout gates

### 3.2 Excluded

- Full clean-slate redesign of activity intelligence (covered by other specs)
- UI redesign of planner progress beyond bug-prevention changes
- Replacing NextAuth/Auth.js
- Full serverless worker architecture replacement
- Product taxonomy redesign (`Place` vs `Activity`) in this remediation pass (tracked separately)

## 4. Current State (Reviewed Findings / Contract)

The following findings are the authoritative inputs to this plan.

### 4.1 Migration Safety Risk (Critical)

- `prisma/migrations/20260226170059_init_activity_rag/migration.sql:11` adds `ChatThread.updatedAt` as `NOT NULL` with no default.
- The same migration recreates multiple tables that already exist in the project migration history, including `OrchestratorJob` (`prisma/migrations/20260226170059_init_activity_rag/migration.sql:38`) and `PlaceCache` (`prisma/migrations/20260226170059_init_activity_rag/migration.sql:81`).

### 4.2 Orchestrator Guard Non-Atomicity (Critical)

- `src/lib/ai/orchestrator-jobs.ts:141` reads the row.
- `src/lib/ai/orchestrator-jobs.ts:220` performs a separate unconditional update.
- Generation/terminal checks are therefore vulnerable to race conditions between read and write.

### 4.3 Refine Path Write Bypass (High)

- `src/lib/agents/planning-agent.ts:735`-`src/lib/agents/planning-agent.ts:742` writes `onQueued` progress directly via `updateOrchestratorJob(...)`.
- No `expectedGenerationId` is provided in that write.
- This bypasses queue serialization and generation scoping.

### 4.4 RAG Inventory Global Scope Contamination (High)

- Planner calls `searchActivitiesSemantic(userPrompt, { limit: 50 })` without city filter in `src/lib/ai/orchestrator.ts:649` and `src/lib/ai/orchestrator.ts:676`.
- `searchActivitiesSemantic` accepts optional `cityId` and performs no city filter by default (`src/lib/db/activity-search.ts:35`, `src/lib/db/activity-search.ts:56`).
- Draft prompt forces the model to pick only from the provided inventory (`src/lib/ai/orchestrator.ts:973`).

### 4.5 RAG `placeId` Not Enforced During Hydration (High)

- Draft schema now includes `placeId` and draft plan preserves it (`src/lib/ai/orchestrator.ts:45`, `src/lib/ai/orchestrator.ts:876`).
- Hydration still geocodes by activity name and does not use `inventory` / `placeId` for coordinate resolution (`src/lib/ai/orchestrator.ts:991`, `src/lib/ai/orchestrator.ts:1091`).

### 4.6 Backend Planner Persistence Ownership Gap (High)

- `src/lib/agents/planning-agent.ts:649`-`src/lib/agents/planning-agent.ts:664` calls `persistTripPlan(snapshot.tripId, ...)` directly.
- `src/lib/trips/persistence.ts:9` only verifies trip existence and performs no ownership/auth check.
- Route-level plan persistence still checks ownership (`src/app/api/trips/[tripId]/plan/route.ts:19`), but planner path bypasses it.

### 4.7 Enrichment Count Inflation (Medium)

- `src/lib/activity-enrichment.ts:171` uses `ON CONFLICT ("externalId") DO NOTHING`.
- `src/lib/activity-enrichment.ts:196` increments `insertedCount` unconditionally after each insert attempt.
- `src/lib/activity-enrichment.ts:203` persists inflated `activityCount` and `enrichmentScore`.

### 4.8 Request-Path Enrichment Latency / Failure Amplification (Medium)

- `src/lib/ai/orchestrator.ts:647` and `src/lib/ai/orchestrator.ts:674` await `triggerEnrichmentIfNeeded(...)` inline before drafting.
- `triggerEnrichmentIfNeeded` can call `ensureCityEnriched(...)` (`src/lib/ai/orchestrator.ts:631`).
- `ensureCityEnriched` performs provider calls + embedding generation synchronously (`src/lib/activity-enrichment.ts:91`, `src/lib/activity-enrichment.ts:149`).

### 4.9 P0 Triage Status Snapshot (Current Branch State)

This triage reflects the current `refactor/deployment-ready` branch working tree at the time of this spec update (including uncommitted branch changes under review).

| P0 Item | Triage Status | What Is Already Landed | Remaining P0 Blocker |
| --- | --- | --- | --- |
| `P0-1` Migration safety | `Partial` | `20260226170059_init_activity_rag/migration.sql` has been replaced with a non-empty-safe, idempotent migration (conditional adds/creates, backfill before NOT NULL) | Must still be validated with `prisma migrate deploy` against a non-empty DB snapshot in CI/preview before marking done |
| `P0-2` Atomic orchestrator guards | `Partial` | `updateOrchestratorJob(...)` now uses guarded atomic `updateMany(...)` writes with explicit `{ applied, reason, row }` outcomes and generation/terminal reject logging in `src/lib/ai/orchestrator-jobs.ts` | Race-focused integration coverage for stale/non-terminal overwrite attempts is still missing |
| `P0-3` Refine-path write scoping | `Done` | `onQueued` now carries `generationId` and writes via generation-scoped queue path in `src/lib/agents/generation-controller.ts` and `src/lib/agents/planning-agent.ts` | None (P0 scope complete) |
| `P0-4` Inventory scoping contamination | `Done` | Destination-scope extraction + segmented multi-city retrieval + strict-mode gating landed in `src/lib/ai/orchestrator.ts`; retrieval now includes city/country metadata in `src/lib/db/activity-search.ts` | None (P0 scope complete; richer multi-city partition enforcement is P1+) |
| `P0-5` Planner persistence ownership | `Done` | Authorized persistence contracts (`persistTripPlanAsUser`, `persistTripPlanInternal`) landed in `src/lib/trips/persistence.ts`; route + planner call sites now use explicit user-scoped contract with audit metadata | None (P0 scope complete) |

## 5. Desired Behavior

After remediation:

1. Prisma migrations apply safely on existing environments.
2. Orchestrator job state guards are atomic at the database boundary.
3. All planner writes that mutate `OrchestratorJob` are generation-scoped.
4. Planner inventory retrieval is city-scoped (or explicitly segmented by destination) when enforcing inventory-only drafts.
5. Hydration uses `placeId` / inventory coordinates first and only falls back to geocoding under explicit conditions.
6. Backend planner persistence writes are authorized and scoped to the correct trip identity.
7. Enrichment accounting reflects actual inserted rows.
8. Request-path enrichment is bounded and does not block planner generation unpredictably.

## 6. Priority Model (P Levels)

### P0 (Release Blocker)

Must be fixed before branch is merged to production-bound mainline or deployed.

Criteria:

- Can break correctness/data integrity
- Can cause production migration failure
- Can write to wrong trip/job state
- Can produce cross-city itinerary corruption under normal planner usage

### P1 (Pre-Launch Required but Can Land After P0)

Must be fixed before enabling the new RAG planner path broadly.

Criteria:

- Causes degraded correctness/quality without immediate data corruption
- Breaks intended contract of new feature but may have fallback behavior
- Causes material cost/latency/reliability regressions under load

### P2 (Post-Stabilization / Hardening)

Valuable but not required to unblock safe rollout of the current branch.

Criteria:

- Operational improvements, metrics polish, or non-critical refactors after correctness is established

## 7. Implementation Plan (Prioritized)

### P0-1. Replace Invalid Activity/RAG Migration with Safe Incremental Migration

**Priority:** P0

**Problem addressed:** Section 4.1

#### Current Triage Status

- `In Progress (Partial)`
- Unsafe migration SQL has been replaced with a safe incremental variant.
- Completion still requires migration execution validation on a non-empty DB snapshot.

#### Required Changes

1. Do not ship `prisma/migrations/20260226170059_init_activity_rag/migration.sql` in its current form.
2. Replace it with a migration generated/applied against the correct current schema baseline.
3. The replacement migration MUST:
- create only missing objects
- alter existing tables safely (no `NOT NULL` columns on populated tables without defaults/backfill)
- avoid re-creating tables already in prior migrations
4. Keep `prisma/migrations/0_init_vector.sql` only if it is part of a documented bootstrap flow and is not executed by `prisma migrate deploy` in normal environments.

#### Constraints

- MUST NOT rewrite historical migrations already applied in shared environments unless a documented reset-only local workflow is explicitly scoped.
- MUST produce a migration that passes `prisma migrate deploy` on a non-empty DB snapshot.

#### Deliverables

- Corrected Prisma migration(s)
- Migration validation notes in PR description or runbook

### P0-2. Make Orchestrator Job Generation/Terminal Guards Atomic (DB-Enforced)

**Priority:** P0

**Problem addressed:** Section 4.2

#### Current Triage Status

- `In Progress (Partial)`

#### Already Landed (Must Be Preserved Unless Replaced by Stronger Equivalent)

- Generation and terminal-state guard checks are implemented in `src/lib/ai/orchestrator-jobs.ts`.
- Structured debug logging for `update.request` / `update.result` and regression detection is present.

#### Remaining P0 Blocker

- The write guard is atomic and now returns explicit applied/rejected outcomes.
- P0 remains open until race-focused integration coverage is added for stale/non-terminal overwrite attempts.

#### Required Changes

1. `updateOrchestratorJob` MUST perform generation and terminal checks atomically with the write.
2. Implement a compare-and-set style update using one of the following approved patterns:
- `updateMany` with conditional `where` clauses including `id`, `generationId`, and allowed terminal/non-terminal status conditions, followed by a read
- single transaction that rechecks invariants immediately before write and prevents interleaving (only acceptable if DB isolation level and query structure actually enforce the invariant)
3. Rejected updates MUST return structured rejection information (applied vs rejected, reason).
4. Rejection reasons MUST include at minimum:
- `generation_mismatch`
- `terminal_state_protection`
- `not_found`

#### Constraints

- Logging-only protection is insufficient.
- Pre-read + unconditional update is prohibited after this change.

#### Deliverables

- Atomic guarded update implementation in `src/lib/ai/orchestrator-jobs.ts`
- Structured logs for accepted/rejected writes
- Integration coverage demonstrating stale/non-terminal writes cannot overwrite terminal state

### P0-3. Eliminate Refine-Path Write Bypass (`onQueued`) and Require Generation Scope for All Planner Job Writes

**Priority:** P0

**Problem addressed:** Section 4.3

#### Current Triage Status

- `Done`

#### Already Landed (Must Be Preserved Unless Replaced by Stronger Equivalent)

- Multiple planner write paths now pass `expectedGenerationId` (draft/progress queue/complete/error).
- Planner progress instrumentation is present and useful for generation-scoped debugging.

#### Remaining P0 Blocker

- None. P0 criteria for generation-scoped `onQueued` writes and queue-path invariants are satisfied.

#### Required Changes

1. `onQueued` in `src/lib/agents/planning-agent.ts` MUST include `expectedGenerationId`.
2. `onQueued` MUST use the same write-path invariants as other progress updates.
3. If queue usage remains, `onQueued` MUST not bypass generation-scoped protections.
4. Audit all `updateOrchestratorJob(...)` callers in planner/orchestrator code for missing `expectedGenerationId`.

#### Constraints

- Any planner-originated write to an existing `OrchestratorJob` without generation scoping is prohibited.

#### Deliverables

- Updated planner write call sites
- Call-site audit checklist (code comment or PR notes)

### P0-4. Prevent Cross-City Inventory Contamination in Drafting

**Priority:** P0

**Problem addressed:** Section 4.4

#### Current Triage Status

- `Done`
- Destination-scoped gating is implemented for single-city and explicit multi-city prompts; broad/ambiguous prompts no longer enforce strict inventory-only drafting.

#### Required Changes

1. Planner inventory retrieval MUST be segmented by destination city/country before passing inventory into `draftItinerary`.
2. If trip is multi-city, inventory MUST be partitioned by day city or destination list (not a single global top-50 pool).
3. If destination cannot be reliably extracted, the system MUST fall back to existing non-RAG drafting behavior or a clearly bounded fallback path.
4. The draft prompt MUST NOT enforce inventory-only selection when the supplied inventory is not destination-scoped.

#### Constraints

- Global semantic top-N inventory for a multi-city or ambiguous prompt is prohibited when prompt requires inventory-only selection.

#### Deliverables

- Updated inventory retrieval strategy in `src/lib/ai/orchestrator.ts`
- Retrieval call contract changes in `src/lib/db/activity-search.ts` (if needed)

### P0-5. Restore Trip Persistence Ownership Guarantees for Backend Planner Writes

**Priority:** P0

**Problem addressed:** Section 4.6

#### Current Triage Status

- `Done`

#### Already Landed (Must Be Preserved Unless Replaced by Stronger Equivalent)

- Backend planner path now persists trip plans directly (reduces frontend persistence coupling).
- Shared persistence helper extraction exists (`src/lib/trips/persistence.ts`).
- Route handler still enforces ownership before calling persistence.

#### Remaining P0 Blocker

- None. Shared persistence requires explicit authorization context and planner call sites are now user-scoped.

#### Required Changes

1. Backend planner persistence path MUST validate trip ownership (or explicit internal authorization context) before mutating trip data.
2. `persistTripPlan(...)` MUST NOT be a publicly callable helper that silently writes any trip by ID without authorization context.
3. Split persistence helpers into explicit contracts, for example:
- `persistTripPlanAsUser({ tripId, userId, ... })`
- `persistTripPlanInternal({ tripId, reason, actor, ... })` with strict internal-only call sites and audit logging
4. Planner path MUST use the explicit contract that proves trip identity is authorized for the current user context.

#### Constraints

- Reusing route-level auth checks implicitly is not acceptable for backend direct writes.
- `snapshot.tripId` alone is not sufficient authorization proof.

#### Deliverables

- Authorized persistence helper contract in `src/lib/trips/persistence.ts`
- Updated call sites (`planning-agent`, route handler)
- Audit logging for planner-triggered trip persistence writes

### P1-1. Enforce `placeId` / Inventory-First Hydration Resolution

**Priority:** P1

**Problem addressed:** Section 4.5

#### Required Changes

1. Hydration (`processDay`) MUST resolve activities by `placeId` from inventory first when provided.
2. Geocoding by name MUST be fallback behavior only when:
- `placeId` is absent, or
- `placeId` cannot be found in the provided inventory partition, or
- inventory record is missing required coordinates
3. Fallback usage MUST be logged with activity name, `placeId`, and reason.
4. If `placeId` is present and inventory lookup succeeds, inventory coordinates MUST be the primary source of truth for route markers.

#### Constraints

- Ignoring `placeId` in hydration after introducing inventory-backed drafting is prohibited.

#### Deliverables

- Inventory lookup path in `src/lib/ai/orchestrator.ts`
- Fallback reason logging

### P1-2. Fix Enrichment Insert Counting and Coverage Accounting

**Priority:** P1

**Problem addressed:** Section 4.7

#### Required Changes

1. `insertedCount` in `src/lib/activity-enrichment.ts` MUST reflect actual inserted rows.
2. Insert path MUST distinguish `inserted` vs `conflict_skipped` results.
3. `City.activityCount` updates MUST be based on actual insert count or recomputed authoritative count.
4. Enrichment result object MUST include both:
- `newActivitiesInserted`
- `conflictSkipped`

#### Constraints

- Incrementing city coverage counters based on insert attempts is prohibited.

#### Deliverables

- Corrected enrichment accounting logic
- Updated logs/metrics for enrichment outcomes

### P1-3. Bound or Defer Request-Path Enrichment

**Priority:** P1

**Problem addressed:** Section 4.8

#### Required Changes

1. Request-path enrichment must be bounded by time budget and failure policy.
2. Approved implementations (choose one for this branch):
- `defer`: enqueue enrichment and continue planning immediately with current inventory + fallback
- `bounded_wait`: wait up to a strict timeout, then continue without enrichment completion
3. Planner path MUST NOT block indefinitely on provider + embedding work.
4. Enrichment failures MUST NOT abort planning draft generation unless planner explicitly depends on enrichment completion.

#### Constraints

- Synchronous enrichment with unbounded provider and embedding calls in planner request path is prohibited.

#### Deliverables

- Updated `triggerEnrichmentIfNeeded` behavior in `src/lib/ai/orchestrator.ts`
- Structured logs for enrichment mode (`deferred`, `bounded_timeout`, `completed_inline`)

### P2-1. Align RAG Module Naming and Domain Boundaries with the Activity Intelligence Specs

**Priority:** P2

**Problem addressed:** Long-term maintainability / domain collision

#### Required Changes

1. Plan the migration from legacy `Activity` terminology to canonical `Place` domain terms (spec-aligned) without breaking current runtime.
2. Introduce domain-layer modules and repository interfaces per the activity-intelligence specs before expanding feature scope further.

#### Constraints

- This is a planned follow-up, not a blocker for P0/P1 remediation.

## 8. Interfaces & Contracts (Required for This Plan)

### 8.1 `updateOrchestratorJob` Contract (Post-Remediation)

`src/lib/ai/orchestrator-jobs.ts`

Required input additions/semantics:

- `expectedGenerationId` for any planner-originated mutation to an existing row
- explicit write intent classification (terminal vs non-terminal) if needed internally

Required output semantics:

- `applied: true|false`
- `reason?: 'generation_mismatch' | 'terminal_state_protection' | 'not_found'`
- current row snapshot after decision (for callers/logs)

### 8.2 Planner Persistence Contract

`src/lib/trips/persistence.ts`

Required semantics:

- Caller must provide an authorization or internal-actor context, not only `tripId`
- The helper must validate that context before writes
- All planner-triggered trip writes must emit audit logs with `tripId`, `jobId`, `generationId`

### 8.3 Inventory Retrieval Contract for Drafting

`src/lib/db/activity-search.ts` and `src/lib/ai/orchestrator.ts`

Required semantics:

- Destination-scoped retrieval input is mandatory when planner prompt enforces inventory-only drafting
- Retrieval output must carry enough metadata for hydration to match by `placeId`

### 8.4 Hydration Resolution Contract

`src/lib/ai/orchestrator.ts`

Required order:

1. inventory lookup by `placeId`
2. inventory coordinate validation
3. geocode fallback by name/context
4. anchor fallback (logged)

## 9. Testing Requirements

### 9.1 Unit Tests (Required)

- atomic orchestrator update decision logic (generation mismatch / terminal-state reject)
- planner inventory scoping builder (single-city and multi-city prompts)
- hydration resolution order (`placeId` hit -> no geocode call; fallback paths logged)
- enrichment accounting (`inserted` vs `conflict_skipped` counts)

### 9.2 Integration Tests (Required)

- orchestrator job race test: terminal `complete` cannot be overwritten by later non-terminal write
- refine generation test: old generation write rejected after reset/new generation
- trip persistence helper authorization enforcement for backend planner path
- Prisma migration apply test on a non-empty baseline snapshot (or representative staging DB clone)

### 9.3 E2E / Flow Tests (Required)

Because user-visible planner behavior is affected, Playwright coverage MUST include:

1. plan trip -> complete -> refine same trip (no stale progress contamination)
2. multi-city plan with inventory-enabled drafting (no obvious cross-city POIs in early draft)
3. planner completion persists title + destination + itinerary to the correct trip

### 9.4 Failure Conditions (Implementation Invalid)

Implementation is invalid if any are true:

- `updateOrchestratorJob` still performs pre-read + unconditional write for guard enforcement
- any planner write path mutates `OrchestratorJob` without generation scoping
- planner still injects global inventory while enforcing inventory-only draft selection
- hydration ignores `placeId` when inventory data is available
- backend planner persistence can write arbitrary trip IDs without authorization/internal actor validation
- the unsafe migration file remains active and deployable in its current state

## 10. Execution Sequence (Mandatory)

Implementers MUST follow this order:

1. P0-1 migration repair
2. P0-2 atomic orchestrator guard implementation
3. P0-3 refine-path write scoping audit/fix
4. P0-5 backend planner persistence authorization contract
5. P0-4 inventory scoping fix (can proceed in parallel with P0-5 only if separate owners)
6. P1-1 `placeId` hydration enforcement
7. P1-2 enrichment accounting fix
8. P1-3 request-path enrichment bounding/deferral
9. P2-1 domain alignment follow-up planning

No P1/P2 task may be marked complete if P0 tasks are unresolved.

Additional sequencing rule for this branch state:

- `P0-2` remains a continuation task from partial implementation already landed in the branch.
- Implementers MUST preserve existing instrumentation and partial guarding semantics unless the replacement is strictly stronger and covered by tests in Section 9.
- Remaining partial implementation status MUST NOT be treated as release-ready completion.

## 11. Acceptance Criteria (Binary)

This remediation plan spec is accepted only if all are true:

- [ ] Every reviewed critical/high finding is assigned to a P-level task in Section 7
- [ ] P0 tasks are explicit enough to implement without follow-up clarification
- [ ] Section `4.9` accurately triages current branch P0 status as `Open` vs `In Progress (Partial)` vs `Done`
- [ ] Atomic orchestrator job invariants are required at the DB boundary (not log-only)
- [ ] Backend planner persistence authorization is explicitly required, not implied
- [ ] RAG inventory scoping and `placeId` hydration enforcement are both covered
- [ ] Migration safety is a P0 blocker with non-empty DB validation requirement
- [ ] Testing requirements include unit, integration, and E2E coverage for refine-path regression

## 12. Out of Scope

This specification does not define:

- the full activity-intelligence target architecture (see existing activity-intelligence specs)
- exact SQL statements for the fixed migration
- final feature flag names for staged RAG rollout (unless needed by implementing team)
- production observability dashboard UI design
