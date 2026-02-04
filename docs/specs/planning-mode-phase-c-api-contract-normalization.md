# Ticket: Planning Mode Phase C - API Contract Normalization

## Goal
Stabilize Planning Mode API contracts so add/remove/save actions are deterministic, typed, and safe for optimistic UI.

## Scope
- Normalize payload/response contracts used by planning actions.
- Remove ambiguous day-resolution behavior and inconsistent status handling.
- Keep endpoint surface area the same for current frontend routing.

## In Scope
- `POST /api/trips/:tripId/items`
- `DELETE /api/trips/:tripId/items/:itemId`
- `POST /api/trips/:tripId/plan`
- `GET/POST /api/itinerary/candidates`
- Thunk response/error handling in planning flows

## Out of Scope
- New endpoints.
- Booking lifecycle redesign.
- Prisma schema migration work unrelated to planning mode interactions.

## Implementation Tasks
1. Add a shared planning API contract module (request/response schemas + error shape) in `src/lib/api/planning-contract.ts`.
2. Refactor `src/app/api/trips/[tripId]/items/route.ts` to:
   - resolve day deterministically (`dayId` first, explicit `dayNumber` fallback)
   - return one canonical response shape for success and validation failures
   - remove non-deterministic fallback behavior
3. Refactor `src/app/api/trips/[tripId]/items/[itemId]/route.ts` to return consistent ownership/not-found/status semantics.
4. Refactor `src/app/api/trips/[tripId]/plan/route.ts` response shape to return stable `dayIdMap` and operation metadata.
5. Refactor `src/app/api/itinerary/candidates/route.ts` to enforce trip scoping and align success/error payloads with the shared contract.
6. Update `src/store/globe-thunks.ts` to consume normalized responses and surface actionable errors for UI.

## Acceptance Criteria (Binary)
- [ ] All planning endpoints return canonical JSON payloads for both success and failure.
- [ ] Day resolution is deterministic and tested for `dayId`, `dayNumber`, and invalid-day cases.
- [ ] Frontend add/remove/candidate flows no longer rely on route-specific ad-hoc parsing.
- [ ] Existing planning UI paths still function after contract normalization.
- [ ] Unit and Playwright tests for API-linked planning flows are added/updated and passing.

## Required Tests
- `src/lib/api/planning-contract.test.ts`
  - schema validation of success/error payloads
- `src/lib/api/planning-day-resolution.test.ts`
  - `dayId` precedence
  - `dayNumber` fallback
  - invalid day rejection
- `src/store/globe-thunks.test.ts` (or equivalent thunk-level tests)
  - normalized success parsing
  - normalized error propagation
- `e2e/booking.spec.ts`
  - add item -> candidate creation -> booking entrypoint remains functional

## Touched Files
- `src/lib/api/planning-contract.ts`
- `src/lib/api/planning-day-resolution.ts`
- `src/app/api/trips/[tripId]/items/route.ts`
- `src/app/api/trips/[tripId]/items/[itemId]/route.ts`
- `src/app/api/trips/[tripId]/plan/route.ts`
- `src/app/api/itinerary/candidates/route.ts`
- `src/store/globe-thunks.ts`
- `src/lib/api/planning-contract.test.ts`
- `src/lib/api/planning-day-resolution.test.ts`
- `src/store/globe-thunks.test.ts`
- `e2e/booking.spec.ts`

## Dependencies
- Requires Phase A and Phase B interaction contracts.

## Estimate
- 2-4 engineering days.
