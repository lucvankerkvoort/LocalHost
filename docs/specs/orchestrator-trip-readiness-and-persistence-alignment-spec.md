# Orchestrator, Trip Persistence, and UI Readiness Alignment Spec

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-02-26

---

## 1. Problem Statement

The trip planning system currently mixes three distinct states:

1. **Orchestrator job state** (`OrchestratorJob` row: draft/running/complete/error)
2. **Frontend rendered state** (globe/routes/markers from `generateItinerary` tool results)
3. **Trip persistence state** (`Trip`, `TripAnchor`, `ItineraryDay`, `ItineraryItem` rows)

This creates user-visible inconsistencies:

- The UI can look complete (markers/routes rendered) while the progress bar remains in a non-terminal stage.
- Route markers can appear "triangulated" / offset because draft placeholder coordinates are rendered before final hydrated coordinates are applied.
- Refresh may not reproduce what the user saw, because refresh loads from `Trip` persistence, not the orchestrator job row.
- Title/destination persistence can fail to occur if the frontend never observes a terminal orchestrator state.

This specification defines the required invariants, boundaries, and implementation sequence to make planner behavior production-ready and observable.

---

## 2. Scope

This specification applies to:

- Planner orchestration job lifecycle (`OrchestratorJob`)
- Planner generation progress updates and completion semantics
- Frontend orchestrator polling/listener behavior
- Trip plan persistence trigger and timing
- Progress bar semantics and readiness messaging
- Route marker coordinate provenance (draft vs hydrated vs persisted)
- Debug logging/observability for silent state inconsistencies

### In Scope Modules (Current System)

- `src/lib/agents/planning-agent.ts`
- `src/lib/agents/generation-controller.ts`
- `src/lib/ai/orchestrator-jobs.ts`
- `src/components/orchestrator-job-listener.tsx`
- `src/components/features/orchestrator-job-status.tsx`
- `src/store/globe-thunks.ts`
- `src/store/globe-slice.ts`
- `src/lib/ai/plan-converter.ts`
- `src/lib/api/trip-converter.ts`
- `src/app/api/orchestrator/route.ts`
- `src/app/api/trips/[tripId]/plan/route.ts`

---

## 3. Out of Scope

The following are explicitly excluded from this spec unless a later spec overrides them:

- Replacing OpenAI/Google providers
- Rewriting planner prompts or tool definitions
- Replacing Cesium globe rendering library
- Full serverless re-architecture of `GenerationController` (covered by production checklist, separate effort)
- Persisting chat transcripts
- New UX design patterns unrelated to planner progress/readiness
- Redis adoption (not required for this spec)

---

## 4. Current Behavior (Contract)

### 4.1 Frontend Rendering

- The globe renders from `generateItinerary` tool results as soon as they are received.
- Draft orchestrator plans can be applied before hydration is complete.
- The progress bar is driven by orchestrator polling status/progress, not by UI render completeness.

### 4.2 Orchestrator Job Lifecycle

- Planner generation writes draft and progress updates to `OrchestratorJob`.
- Progress writes are currently issued during tool callbacks and may be fire-and-forget.
- Completion is represented by `job.status === 'complete'` with a final `plan`.

### 4.3 Trip Persistence

- Trip persistence is currently frontend-mediated.
- The frontend listener persists the trip plan only after observing `job.status === 'complete'`.
- Refresh loads from `Trip` DB, not from the `OrchestratorJob` row.

### 4.4 Route Marker Coordinates

- Draft plans may contain placeholder/jittered coordinates prior to full hydration.
- Route markers are generated from plan activity coordinates.
- DB trip load path may fall back to anchor coordinates if `ItineraryItem.lat/lng` are missing.

---

## 5. Definitions (Required Terminology)

Implementers MUST use these terms consistently in code comments, logs, and specs:

| Term | Definition |
|------|------------|
| **Draft Plan** | Planner output before place/route/host hydration is complete. May include placeholder/jittered coordinates. |
| **Hydrated Plan** | Planner output after real tool results have populated coordinates/routes/hosts. |
| **Visual Ready** | The UI has a usable plan rendered (destinations/routes/markers visible) regardless of backend terminal state. |
| **Job Complete** | `OrchestratorJob.status === 'complete'` for the active generation. |
| **Persisted** | `Trip` DB rows have been successfully updated with title/stops/days/items for the current generation. |
| **Coordinate Fallback** | Replacing missing item `lat/lng` with anchor coordinates during DB->UI conversion. |

---

## 6. Failure Modes (Observed / Must Address)

### FM-01: Job/UI Readiness Mismatch

- UI is visually ready but orchestrator status remains `running`.
- Progress UI appears frozen or misleading.

### FM-02: Draft Coordinates Persist in UI

- Draft placeholder/jittered activity coordinates remain visible because final plan replacement is not observed/applied.

### FM-03: Refresh Loses Fidelity

- Refresh repopulates from `Trip` DB; if persistence failed or item coords are missing, the UI differs from the pre-refresh UI.

### FM-04: Silent State Inconsistency (No Exception)

- Async DB writes succeed but arrive out of order.
- Older progress writes can overwrite newer state without throwing errors.

### FM-05: Missing Title/Destination Persistence

- Title/destination are stored as part of trip plan persistence path.
- If completion/persistence path does not execute, trip remains blank despite visual plan.

---

## 7. Non-Negotiable Invariants

### 7.1 Identity & Scoping Invariants

> **INV-ID-01**: On `/trips/{tripId}`, the route `tripId` is the source of truth for planner tool event scoping and orchestrator listener application.

> **INV-ID-02**: A planner job result MUST NOT be applied to a trip page whose route `tripId` does not match the result `tripId`.

### 7.2 Orchestrator Job State Invariants

> **INV-JOB-01**: `complete` and `error` are terminal states for a given generation. Non-terminal updates MUST NOT overwrite a terminal state for the same generation.

> **INV-JOB-02**: Orchestrator updates MUST be generation-aware. A write for generation `G_old` MUST NOT overwrite state for generation `G_new`.

> **INV-JOB-03**: Completion is the authoritative signal that the plan is hydrated enough for the current persistence path.

> **INV-JOB-04**: Silent state regressions (e.g., `complete -> running`) MUST produce a structured log signal.

### 7.3 Coordinate Provenance Invariants

> **INV-COORD-01**: Draft placeholder/jittered coordinates MUST be treated as draft-only coordinates.

> **INV-COORD-02**: Route markers rendered from a Draft Plan MUST be explicitly considered provisional.

> **INV-COORD-03**: DB load path MUST NOT silently hide missing item coordinates; coordinate fallback events MUST be logged with trip context.

### 7.4 Persistence Invariants

> **INV-PERSIST-01**: Refresh behavior is defined solely by `Trip` DB state, not by in-memory orchestrator/tool state.

> **INV-PERSIST-02**: Trip title and destination persistence MUST be part of an explicit persistence transition (draft metadata persistence or final plan persistence) and MUST NOT depend on implicit UI-only state.

> **INV-PERSIST-03**: A successful UI render MUST NOT be interpreted as successful trip persistence.

### 7.5 UX/Progress Semantics Invariants

> **INV-UX-01**: Progress UI MUST represent orchestrator state, not general “screen readiness,” unless explicitly labeled otherwise.

> **INV-UX-02**: If UI is Visual Ready before Job Complete, the UI MUST be allowed to communicate “ready / syncing” semantics without blocking user interaction.

---

## 8. Required Plan of Action (Implementation Sequence)

This sequence is mandatory. Later phases MUST NOT be implemented before earlier phases are verified.

### Phase 0 — Instrumentation and Evidence Capture (Immediate)

**Goal:** Prove the exact failure path in a reproducible run.

#### Requirements

- Add debug-only logs (env-flag gated) in:
  - orchestrator job DB write path
  - planner progress write callbacks
  - frontend orchestrator listener poll/apply path
  - DB->UI trip converter coordinate fallback path
- Logging MUST include:
  - `jobId`
  - `generationId`
  - `status`
  - `stage`
  - `updatedAt`
  - progress counters (`current/total`)
  - whether `plan` is present
  - whether complete plan was applied in the client
- Coordinate fallback logging MUST include:
  - `tripId`
  - count of fallback items
  - sample item IDs/titles with missing `lat/lng`

#### Exit Criteria

- A single repro run can be traced end-to-end with one `jobId` and one `generationId`.
- Logs can distinguish:
  - backend state regression
  - missing final-plan application in frontend
  - missing persisted item coordinates on reload

### Phase 1 — Orchestrator Job State Correctness (P0)

**Goal:** Make job state transitions reliable and non-regressing.

#### Required Changes

1. **Generation-aware updates**
- Every planner progress/completion write MUST specify the expected `generationId`.
- `updateOrchestratorJob` (or a dedicated guarded variant) MUST reject writes when the row generation does not match.

2. **Terminal-state protection**
- Non-terminal progress writes (`draft`/`running`) MUST NOT overwrite a row already in `complete` or `error` for the same generation.
- Completion writes MUST be idempotent.

3. **Structured anomaly logging**
- If a write is dropped due to generation mismatch or terminal-state guard, log a structured event.
- If a regression attempt is detected, log an explicit warning/error event.

4. **No silent completion ambiguity**
- Completion path MUST log before/after row state and whether the write was accepted.

#### Constraints (Phase 1)

- MUST NOT change planner prompts, tool schemas, or UI rendering behavior.
- MUST NOT require Redis.
- MUST NOT require replacing `GenerationController`.
- MAY introduce a guarded DB update function and/or conditional Prisma `updateMany` path.

#### Exit Criteria

- For any single generation, once a job reaches `complete`, subsequent progress writes cannot move it back to `running`.
- Frontend polling eventually observes terminal `complete` for successful generations.

### Phase 2 — Frontend Readiness Semantics and Draft Coordinate Handling (P0/P1 split)

**Goal:** Stop misleading users when UI is visually ready before backend status catches up.

#### Phase 2A (P0): Readiness Semantics

1. Introduce explicit UI terminology/states:
- `visual_ready`
- `job_syncing` (or equivalent)
- `job_complete`
- `persisted`

2. Progress/status UI MUST:
- Avoid implying “not usable” if the trip is already visually ready.
- Show non-blocking sync messaging (e.g., “Trip ready, syncing final details…”) when appropriate.

3. Progress stale detection MUST use backend job timestamps/signatures, not local poll cadence alone.

#### Phase 2B (P1): Draft Marker Policy

Choose one policy and implement consistently (no partial mixing):

**Policy A (Preferred for correctness):**
- Do not render route markers from Draft Plan activity coordinates.
- Render only anchors/place markers until hydrated/final plan is applied.

**Policy B (Accept draft UI):**
- Render draft route markers but mark them as provisional.
- Replace them with hydrated coordinates on completion.
- If completion is not observed after timeout, show a non-blocking “draft coordinates” indicator.

#### Constraints (Phase 2)

- MUST NOT reintroduce cross-trip contamination.
- MUST NOT tie UI progress rendering to trip persistence side effects.

#### Exit Criteria

- A user can distinguish “trip usable now” vs “background sync still running.”
- Route markers no longer appear permanently “triangulated” due to draft-only coordinates being mistaken for final.

### Phase 3 — Persistence Ownership Clarification (P1)

**Goal:** Make title/destination/plan persistence explicit and predictable.

#### Required Decision (Must be documented in code comments / follow-up spec)

One of the following ownership models MUST be selected:

1. **Frontend-mediated persistence (current model, hardened)**
- Frontend listener persists final plan after observing `job.complete`.
- Explicit UI states distinguish `visual_ready` vs `persisted`.
- Failures are surfaced as non-blocking persistence errors.

2. **Backend-owned persistence (target model)**
- Planner backend persists `Trip` DB directly.
- `OrchestratorJob` transitions to `complete` only after trip persistence succeeds.
- Frontend reads a single authoritative completion signal.

#### Minimum Required Fixes (even if staying frontend-mediated)

- Persistence dispatch result MUST be observed (success/failure), not fire-and-forget.
- Failure to persist title/destination/plan MUST produce:
  - explicit client log
  - visible non-blocking UI state

#### Exit Criteria

- “UI looked complete but title/destination never saved” becomes diagnosable and surfaced, not silent.

### Phase 4 — Refresh Fidelity and Coordinate Persistence Validation (P1)

**Goal:** Ensure refresh reproduces the same coordinates users saw post-completion.

#### Required Changes

1. Validate persisted item coordinates on save
- Save path MUST preserve `item.lat/lng` for all mappable items when provided.
- If coordinates are absent, save path MUST log/annotate the omission.

2. Coordinate fallback observability on load
- DB->UI converter MUST log fallback usage (already instrumented in debug mode).
- Production path SHOULD emit a structured warning metric when fallback count > 0.

3. Refresh parity checks (tests)
- Completed trip reload MUST reproduce marker locations (within tolerance) from persisted data.

#### Exit Criteria

- Reloaded route markers match persisted item coordinates, not unexpected anchor fallbacks.

### Phase 5 — Documentation / Operationalization (P1)

**Goal:** Make this failure mode visible in production readiness docs.

#### Required Documentation Updates

1. `docs/production-deployment-checklist.md`
- Add a **Critical Blocker** for orchestrator job state transition correctness:
  - terminal-state non-regression
  - generation-scoped writes
  - out-of-order async write protection
  - tests for state regressions

2. `docs/runbook.md`
- Expand “Orchestrator job stuck” to include:
  - `job.plan exists but status != complete`
  - how to inspect generation mismatch / regression logs
  - coordinate fallback diagnostics for route markers

---

## 9. Detailed Technical Requirements

### 9.1 Orchestrator Job Write API (Required Behavior)

If a guarded update function is introduced, it MUST support:

- `id` (required)
- `expectedGenerationId` (required for planner progress/completion writes)
- `allowOverwriteTerminal` (default `false`)
- partial updates for `status`, `progress`, `plan`, `hostMarkers`

**Required outcomes:**

- `applied: true` when row updated
- `applied: false` with reason:
  - `generation_mismatch`
  - `terminal_state`
  - `not_found`

This result MUST be loggable without throwing.

### 9.2 Progress Update Sequencing

Progress writes MAY remain asynchronous, but correctness MUST NOT depend on network/DB write order.

Acceptable mechanisms:

- guarded DB writes with terminal-state protection and generation checks
- serialized write queue per `jobId/generationId`
- sequence-numbered updates with compare-and-set ordering

Unacceptable mechanism:

- blind `update` writes that can overwrite newer state without detection

### 9.3 Frontend Listener Application Rules

The listener MUST:

- apply draft plan at most once per generation (already true)
- apply complete plan at most once per generation (already true)
- record/log when `job.plan` exists but `job.status !== complete` for prolonged periods
- not infer persistence success from visual plan application

### 9.4 Progress Bar Semantics

The progress/status component MUST render based on explicit state categories, not raw backend wording alone.

Minimum display states:

- `Planning trip...` (draft/running before visual-ready)
- `Trip ready` (visual-ready)
- `Syncing final details...` (visual-ready but not job-complete and/or not persisted)
- `Trip plan ready` (job-complete and persisted, if persistence is tracked)
- `Planner error` (error)

---

## 10. Test Requirements (Definition of Correctness)

### 10.1 Unit Tests (Required)

1. **Orchestrator job transition tests**
- `complete` cannot regress to `running` from a later non-terminal write
- generation mismatch progress update is rejected
- completion is idempotent

2. **Planner progress write behavior tests**
- out-of-order simulated progress/completion writes do not leave final row non-terminal

3. **Trip converter coordinate fallback tests**
- fallback count/log path triggers when item coordinates are missing
- non-missing coordinates do not trigger fallback logging path

4. **Progress UI state mapping tests**
- visual-ready + syncing states map to correct user copy (follow-up if implemented)

### 10.2 Integration Tests (Required)

1. **Frontend listener + orchestrator polling**
- draft plan applied, final plan applied on complete
- no final-plan application when status remains non-terminal
- logging/diagnostic path invoked for prolonged `plan-without-complete`

2. **Trip persistence dispatch observation**
- failed persistence is surfaced as explicit state/log (no silent success)

### 10.3 E2E / Manual Regression Tests (Required Before Production)

1. Create trip -> generate plan -> verify:
- routes/markers appear
- title/destination persist
- refresh reproduces same markers

2. Generate plan with slow hydration path -> verify:
- UI can be used while syncing
- progress text does not imply broken state

3. Cross-trip isolation regression
- Trip B generation MUST NOT inherit Trip A job/tool state

---

## 11. Acceptance Criteria (Pass/Fail)

1. **Job State Correctness**
- For a successful planner generation, `OrchestratorJob` reaches `complete` and does not regress to `running` for the same `jobId/generationId`.

2. **Final Plan Application**
- When a hydrated final plan exists and `job.status === complete`, the frontend applies the final plan exactly once for that generation.

3. **Route Marker Fidelity**
- Route markers shown after completion reflect hydrated coordinates, not draft jitter coordinates.

4. **Refresh Parity**
- Refresh after successful completion reproduces title, destination, and route marker locations from `Trip` DB (within rendering tolerance).

5. **Persistence Visibility**
- If trip persistence fails after visual render, the system emits an explicit error/log signal; the failure is not silent.

6. **Progress Semantics**
- The UI distinguishes “visually ready” from “still syncing/finalizing,” and does not rely solely on orchestrator raw progress stage text.

7. **Cross-Trip Safety**
- Planner jobs/results do not apply across trip routes after route transitions.

8. **Operational Docs**
- `docs/production-deployment-checklist.md` includes orchestrator state transition correctness as a critical blocker.

---

## 12. Explicit Non-Changes (Must Not Change Unless a New Spec Says So)

- The route-first trip scoping fix on trip pages MUST remain in place.
- Host onboarding chat scoping behavior MUST remain unchanged.
- The planner may continue to produce draft plans before hydration completes.
- The UI-only progress mapper introduced for curated labels MAY remain; it does not satisfy backend correctness requirements by itself.

---

## 13. Open Decisions Requiring Explicit Selection (No Implicit Defaults)

The following decisions MUST be made explicitly before Phase 3 implementation:

1. **Draft route marker policy**
- `A`: Suppress draft route markers until hydrated/final
- `B`: Show provisional draft route markers with explicit UI indication

2. **Persistence ownership**
- `A`: Harden frontend-mediated persistence
- `B`: Move trip persistence into backend planner lifecycle

3. **Job update ordering mechanism**
- `A`: Guarded conditional DB updates
- `B`: Serialized write queue
- `C`: Sequence-numbered compare-and-set

No implementation may proceed on these items using implicit behavior.

---

## 14. Implementation Hand-off Notes

- This spec intentionally separates **correctness** (state invariants) from **UX polish** (progress presentation).
- Implementers MUST fix correctness first (Phase 1) before interpreting progress UI behavior as resolved.
- Debug instrumentation from Phase 0 SHOULD remain behind env flags until Phase 1 is verified in staging.

---

*End of Specification*

