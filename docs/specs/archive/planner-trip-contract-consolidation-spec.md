# Technical Specification - Planner Trip Contract Consolidation

**Author:** Architect  
**Status:** Active (PR1-PR4 Implemented, integration/e2e verification pending)  
**Last Updated:** 2026-02-28  
**Primary Area:** Planner agent trip read/write contract and persistence flow

Legend:
- `[x]` Completed
- `[ ]` Pending

## 0. Purpose
Define a constraint-driven implementation plan to consolidate trip plan contracts and data flow for the planner system, eliminate schema drift, and establish a single write path.

This specification is executable: implementers must follow the sequence and requirements exactly.

## 1. Problem Statement
The planner and trip stack currently use multiple overlapping JSON/type shapes for the same domain object (trip plan), with independent mapping layers between:
- Planner tool payloads
- API route payloads
- Persistence payloads
- DB relational entities
- Frontend globe representations

This increases drift risk and creates regressions (field loss, inconsistent validation, inconsistent read/write behavior).

## 2. Scope
### In Scope
- Canonicalize trip plan write payload contract with shared schema/types.
- Enforce payload validation in `POST /api/trips/[tripId]/plan`.
- Introduce a repository layer for planner trip read/write operations.
- Route planner-generated writes and planner updates through the same persistence entry path.
- Version and stabilize planner-facing itinerary context JSON.
- Add trip revision history and restore-to-preferred-state capability.
- Add tests that prove contract correctness and round-trip field preservation.

### Out of Scope
- UI redesign.
- Database schema migration for PR1-PR3.
- Replacing orchestrator planning logic.
- Replacing semantic search tooling.
- Reworking globe rendering architecture.
- Full event-sourcing adoption.

## 3. Existing Behavior Contract To Preserve
The following behavior must remain unchanged unless explicitly overridden in this spec:
1. Valid trip plan payloads accepted today must still persist successfully.
2. Trip ownership checks and auth enforcement must remain unchanged.
3. Planner generation pipeline and orchestrator job progress states must remain unchanged.
4. Trip save endpoint path remains `POST /api/trips/[tripId]/plan`.

## 4. Target Architecture
### 4.1 Canonical Write Contract
- Shared source of truth: `src/lib/trips/contracts/trip-plan.schema.ts`.
- Route and persistence consume schema-inferred types, not duplicated local interfaces.

### 4.2 Repository Boundary
Create `src/lib/trips/repository.ts` as planner-facing boundary for trip plan data operations:
- `loadTripPlanForUser(userId: string, tripId: string): Promise<TripPlanReadModel | null>`
- `saveTripPlanForUser(input: SaveTripPlanForUserInput): Promise<SaveTripPlanResult>`

No planner module may query trip/day/item tables directly after PR2 completion.

### 4.3 Planner Tool Contracts
Planner tools must use explicit versioned JSON for itinerary context:
- `schemaVersion: "trip_context_v1"`
- `context: TripContextV1`

`trip_context_v1` must be stable and documented in code.

### 4.4 Trip Revisioning Contracts (PR4)
Trip versioning must use immutable revisions:
- Each successful planner mutation (`generateItinerary`, `updateItinerary`) creates a new revision.
- Active trip points to one current revision.
- Restoring an old revision creates a new revision (do not mutate historical rows).
- Queue commands must carry `expectedVersion` to prevent stale writes.

## 5. Constraints and Invariants (Non-Negotiable)
1. **Single Write Path Invariant**
- All planner trip writes (initial generation and update flows) must go through shared persistence APIs via repository.

2. **Field Preservation Invariant**
- Canonical fields must survive read -> transform -> write round trip:
  - stop: `title`, `type`, `locations[*].{name,lat,lng,placeId}`
  - day: `dayIndex`, `date`, `title`, `suggestedHosts`
  - item: `type`, `title`, `description`, `startTime`, `endTime`, `locationName`, `placeId`, `lat`, `lng`, `experienceId`, `orderIndex`, `createdByAI`

3. **Validation Invariant**
- Invalid payloads to plan save endpoint return HTTP 400 with deterministic JSON error shape.

4. **Compatibility Invariant**
- `placeId` compatibility behavior (when column support is absent) remains intact.

5. **No Hidden Behavior Changes**
- Valid requests must not change output semantics solely because validation layer was added.

6. **Immutable Revision Invariant (PR4)**
- Historical revisions are append-only and immutable.

7. **Restore Safety Invariant (PR4)**
- Restoring a previous itinerary state must create a new active revision and preserve prior history.

## 6. Implementation Plan
### Phase PR1 - Shared Write Contract and API Validation (Completed)
Delivered:
- [x] Added shared schema/types for trip plan write payload.
- [x] Updated `POST /api/trips/[tripId]/plan` to reject invalid JSON with `INVALID_JSON` (400).
- [x] Updated `POST /api/trips/[tripId]/plan` to reject invalid payload with `INVALID_PAYLOAD` + issue list (400).
- [x] Reused schema-derived types in persistence input contracts.
- [x] Added schema unit tests.

Exit Criteria (met):
- [x] Typecheck and lint pass.
- [x] Schema tests pass.
- [x] Valid payload persistence path unchanged.

### Phase PR2 - Repository Extraction and Planner Read/Write Unification (Next)
Required changes:
- [x] Add `src/lib/trips/repository.ts` with user-scoped read/write functions.
- [x] Move planner snapshot loading logic out of `planning-agent.ts` into repository.
- [x] Remove planner-local direct write path and route planner updates through shared persistence path.
- [x] Ensure planner update flow preserves `placeId` where present.

Required file impacts:
- `src/lib/agents/planning-agent.ts`
- `src/lib/trips/repository.ts` (new)
- `src/lib/trips/persistence.ts` (only if needed for shared helpers)
- related tests

Exit Criteria:
- [x] No direct planner Prisma reads/writes for trip/day/item entities remain.
- [x] Planner update and planner generation use same persistence entry path.
- [x] Round-trip preservation tests pass (including `placeId`).

### Phase PR3 - Versioned Trip Context + Intent/Regex Isolation
Required changes:
- [x] Replace descriptive `schema` string object in `getCurrentItinerary` response with versioned context payload.
- [x] Add strict schema for `trip_context_v1`.
- [x] Isolate itinerary intent/removal regex logic into dedicated module (`planner-intent.ts`).
- [x] Keep regex fallback behavior but prevent broad over-matching regressions.

Exit Criteria:
- [x] `getCurrentItinerary` response is validated and versioned.
- [x] Planner-facing JSON shape is stable and test-covered.
- [x] Intent/removal logic has isolated tests for false-positive protection.

### Phase PR4 - Trip Versioning and Restore (Next After PR3)
Required changes:
- [x] Add revision model (`TripRevision`) and active revision pointer (`Trip.currentVersion` or equivalent).
- [x] Persist canonical itinerary payload/snapshot per revision.
- [x] On planner generate/update success, create new revision and update active pointer atomically.
- [x] Add restore operation: restore from revision N by creating revision N+1 copied from N.
- [x] Add optimistic concurrency guard using `expectedVersion` for queued commands.
- [x] Define explicit behavior for bookings/payments on restore (non-itinerary side effects must not silently mutate).

Required file impacts:
- `prisma/schema.prisma` (PR4 only)
- new migration files (PR4 only)
- `src/lib/trips/repository.ts`
- `src/lib/trips/persistence.ts` (if needed for revision-aware writes)
- planner mutation entry points
- related tests

Exit Criteria:
- [x] Users can list revisions and restore a prior state without losing history.
- [x] Concurrent stale commands are rejected or safely rebased using version checks.
- [x] Revision creation is atomic with active-pointer update.

## 7. File-Level Requirements
### Must Modify or Add
- [x] `src/lib/trips/contracts/trip-plan.schema.ts`
- [x] `src/lib/trips/contracts/trip-plan.schema.test.ts`
- [x] `src/app/api/trips/[tripId]/plan/route.ts`
- [x] `src/lib/trips/persistence.ts`
- [x] `src/lib/trips/repository.ts` (PR2)
- [x] `src/lib/agents/planning-agent.ts` (PR2/PR3)
- [x] `src/lib/agents/planner-intent.ts` (PR3)
- [x] PR4 schema + migration files for trip revisions
- [x] test files for planner and repository behavior

### Must Not Modify
- DB schema for PR1-PR3.
- Endpoint path contracts outside planner trip read/write boundaries.
- Orchestrator job status model.

## 8. Test Requirements (Definition of Correctness)
### Unit Tests (Required)
- [x] Shared write schema accepts valid minimal and detailed payloads.
- [x] Shared write schema rejects invalid payload with expected issue paths.
- [x] Planner removal target parsing does not over-remove on short/generic tokens.
- [x] Repository mapping preserves canonical fields including `placeId`.

### Integration Tests (Required)
- [ ] `POST /api/trips/[tripId]/plan` returns deterministic 400 JSON for invalid body.
- [ ] Valid payload persists and can be read back with same canonical fields.
- [ ] Planner update flow removes only intended entities and preserves untouched fields.
- [ ] Revision is created for each successful generate/update mutation.
- [ ] Restore creates a new revision and updates active pointer atomically.
- [ ] Stale `expectedVersion` command is rejected with deterministic error.

### E2E / Flow Tests (Required if user-visible behavior changes)
- [ ] Generate itinerary -> save -> refresh -> itinerary still renders correctly.
- [ ] Update itinerary by removal request -> refresh -> expected target removed, unrelated entries preserved.
- [ ] Restore previous revision -> refresh -> restored itinerary is active and prior revisions remain available.

## 9. Acceptance Criteria (Binary Pass/Fail)
- [x] Exactly one planner write path exists for trip/day/item persistence.
- [x] `placeId` and other canonical fields are preserved through planner update round trips.
- [x] Plan save endpoint rejects invalid payloads with deterministic HTTP 400 JSON error contract.
- [x] Planner itinerary context response is versioned (`trip_context_v1`) and validated.
- [x] Trip revisions are immutable and restorable with version-safe concurrency.
- [ ] Required unit/integration tests are present and passing.

## 10. Execution Order
- [x] PR1 (completed): shared write schema + API validation.
- [x] PR2 (completed): repository extraction + planner read/write unification.
- [x] PR3 (completed): versioned context + regex isolation + contract hardening tests.
- [x] PR4: trip versioning + restore + concurrency guards.

No phase may be marked complete unless its exit criteria and test requirements are satisfied.
