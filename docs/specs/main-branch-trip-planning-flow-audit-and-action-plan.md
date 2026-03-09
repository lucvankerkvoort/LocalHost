# Main Branch Trip Planning Flow Audit and Action Plan

**Branch:** `main`  
**Commit:** `10acaccd34f7a1834122c598d25108ac9b6ab05b`  
**Date:** 2026-03-07  
**Status:** Audit complete

## 1. Authoring Conformance

This document is authored to the `AGENTS.md` `Architect` contract.

The `Technical Specification Authoring (Constraint-Driven)` skill referenced by `AGENTS.md` is not available in this session. This report therefore follows the same constraint-driven format directly: explicit scope, explicit invariants, concrete failure modes, required remediation phases, test requirements, and binary acceptance criteria.

## 2. Problem Statement

On current `main`, the trip planning flow still does not operate on one canonical trip representation from generation through reload.

The branch currently allows at least three different truths for the same trip:

1. The planner job plan held in `OrchestratorJob.plan`
2. The Redux globe state derived from that plan
3. The persisted `Trip` / `TripAnchor` / `ItineraryDay` / `ItineraryItem` rows

Because those truths use different IDs, different day semantics, and different field sets, users can:

1. See one itinerary immediately after generation
2. See a different itinerary after refresh or reopen
3. Add follow-up experiences that appear in the UI but never persist
4. Encounter duplicate or misaligned day numbering

This is a production trust issue, not just a cosmetic issue.

## 3. Scope

This audit covers the full traveler flow on current `main`:

1. Trip creation
2. Chat/planner entry
3. Planner job generation
4. Initial trip rendering in the UI
5. Trip persistence to the database
6. Saved trips listing
7. Opening an existing trip
8. Follow-up itinerary mutations that depend on persisted day identity

## 4. Exclusions

This document does not cover:

1. Host onboarding
2. Payment correctness beyond itinerary/day identity dependencies
3. Visual redesign work
4. Search/ranking quality of planner experiences except where it affects trip consistency

## 5. Current Flow on `main`

### 5.1 Trip Creation

1. `/trips` uses `createTrip()` server action from `src/actions/trips.ts`.
2. `POST /api/trips` in `src/app/api/trips/route.ts` is a separate creation path with different validation and defaults.
3. The user is navigated to `/trips/[tripId]`.

### 5.2 Planner Entry

1. `ChatWidget` derives `chatId` from route intent and optional `tripId`.
2. `/api/chat` routes to `agentRouter`.
3. `agentRouter.route()` currently always returns `general`, which maps to `PlanningAgent`.

### 5.3 Planner Generation

1. `PlanningAgent.generateItinerary` schedules `plannerGenerationController`.
2. `planner-generation.ts` drafts a plan, writes it to `OrchestratorJob`, then hydrates and persists the final trip.
3. Persistence happens through `convertPlanToGlobeData(plan)` -> `convertGlobeDestinationsToApiPayload(destinations)` -> `saveTripPlanPayloadForUser(...)`.

### 5.4 UI Rendering

1. `OrchestratorJobListener` polls `/api/orchestrator?jobId=...`.
2. The listener applies the draft job plan to Redux.
3. The listener applies the complete job plan to Redux.
4. The listener does not reload the persisted trip from the database after completion.

### 5.5 Existing Trip Load

1. `GlobeItinerary` dispatches `fetchActiveTrip(tripId)`.
2. `fetchActiveTrip` loads `/api/trips/[tripId]`.
3. `convertTripToGlobeDestinations` rebuilds the globe state from persisted rows.

## 6. Non-Negotiable Invariants That Must Hold

The following invariants are required for a trustworthy trip product. Current `main` violates several of them.

### INV-01 Day Identity

Day order must be canonical and day numbers must be unique, sequential, and stable across:

1. LLM output
2. In-memory plan
3. Persisted DB rows
4. Rendered UI

### INV-02 Canonical Completion

After planner completion, the UI must converge to the persisted database snapshot before the user performs follow-up mutations.

### INV-03 Stable Mutation Targets

Any follow-up action that mutates a trip must operate on persisted day IDs and persisted item IDs, not synthetic in-memory placeholders.

### INV-04 No Lossy Plan Persistence

The persistence path must preserve all user-visible itinerary fields that the planner produced:

1. day numbering
2. dates
3. per-day titles
4. item coordinates
5. per-hop transport
6. route geometry if shown in the UI

### INV-05 Trip-Scoped Reload

Any reload after a mutation must explicitly reload the same trip that was mutated.

### INV-06 Single Day Index Semantics

The system must choose one day numbering convention and use it everywhere. Dual 0-based/1-based fallback logic is forbidden.

### INV-07 Session Isolation

Planner state must be scoped to a user and trip/session context. No traveler can inherit another traveler’s planner metadata.

## 7. Findings

## F-01 `P0` Duplicate and Misaligned Day Numbers Are Still Allowed End-to-End

**Evidence**

1. `src/lib/ai/orchestrator.ts` `DraftItinerarySchema` only requires `dayNumber: z.number()`.
2. `src/lib/ai/orchestrator.ts` `draftItinerary()` prompt does not require unique sequential day numbers.
3. `src/lib/ai/orchestrator.ts` `buildDraftPlan()` copies `day.dayNumber` through without normalization.
4. `src/lib/ai/plan-converter.ts` `convertPlanToGlobeData()` iterates `plan.days` as-is.
5. `src/lib/api/trip-converter.ts` `convertTripToGlobeDestinations()` sorts by `dayIndex` but does not normalize or deduplicate.
6. `prisma/schema.prisma` defines `@@unique([tripAnchorId, dayIndex])` for `ItineraryDay`, so duplicate day indices inside one stop are invalid at the DB level.

**Impact**

1. Duplicate `Day 10` style UI rendering remains possible.
2. A plan can render in the UI and still fail persistence because the same stop receives duplicate `dayIndex` values.
3. The app has no single rule for which day is “Day 7” when duplicates or gaps appear.

## F-02 `P0` Planner Completion Does Not Rehydrate From the Database

**Evidence**

1. `src/lib/agents/planner-generation.ts` persists the completed plan server-side.
2. `src/components/orchestrator-job-listener.tsx` applies `job.plan` on `complete`.
3. `src/components/orchestrator-job-listener.tsx` does not dispatch `fetchActiveTrip(jobTripId)` after completion.

**Impact**

1. The post-generation UI is not the canonical persisted trip.
2. The user can continue interacting with an ephemeral plan object that may differ from what was saved.
3. Refresh and reopen are free to show a different itinerary than the one the user just saw.

## F-03 `P0` Generated Day IDs Stay Synthetic, So Follow-Up Edits Can Be Local-Only and Non-Persistent

**Evidence**

1. `src/lib/ai/plan-converter.ts` creates destination IDs with `generateId()`.
2. `src/lib/ai/plan-converter.ts` creates itinerary item IDs with `createItem(...)`, which also generates new IDs.
3. `src/store/globe-slice.ts` `updateDayIds()` exists, but only updates generated days when a `/plan` API response returns `dayIdMap`.
4. `src/store/globe-thunks.ts` dispatches `updateDayIds(...)` only inside `saveTripPlan` and `saveTripPlanForTrip`.
5. The planner job completion flow does not call either thunk and does not return `dayIdMap` to the client.
6. `src/store/globe-thunks.ts` `addExperienceToTrip()` treats hyphenated/short `dayId` values as temporary and falls back to local-only state.

**Impact**

1. Immediately after planner completion, adding an experience can succeed visually and still never hit the database.
2. A user can think they edited the trip, refresh, and lose the edit.
3. This is a direct post-generation trust breaker.

## F-04 `P0` Add/Remove Experience Can Reload the Wrong Trip

**Evidence**

1. `src/store/globe-thunks.ts` `addExperienceToTrip()` dispatches `fetchActiveTrip()` with no `tripId`.
2. `src/store/globe-thunks.ts` `removeExperienceFromTrip()` dispatches `fetchActiveTrip()` with no `tripId`.
3. `src/store/globe-thunks.ts` `fetchActiveTrip(undefined)` loads the first trip from `/api/trips` or creates a default trip.

**Impact**

1. In multi-trip accounts, editing Trip B can reload Trip A.
2. If there are no trips in the default path, the app can create a new trip unexpectedly.
3. Users can interpret this as lost itinerary data or corrupted saved trips.

## F-05 `P0` The Planner Persistence Path Is Lossy

**Evidence**

1. `src/lib/ai/types.ts` `DayPlanSchema` includes `date` and `interCityTransportToNext`.
2. `src/lib/ai/plan-converter.ts` `convertPlanToGlobeData()` sets `date: undefined` on destinations.
3. `src/lib/trips/contracts/trip-plan.schema.ts` `TripPlanWritePayloadSchema` has no route contract at all.
4. `src/lib/api/trip-converter.ts` `convertGlobeDestinationsToApiPayload()` persists stops/days/items only.
5. `src/store/globe-thunks.ts` `buildRoutesFromDestinations()` reconstructs routes heuristically with generated IDs and a global/default transport mode.
6. `src/lib/agents/planner-generation.ts` persists the plan through the lossy globe conversion instead of a direct plan-to-write model.

**Impact**

1. Day dates produced by the planner are lost on save/reload.
2. Per-hop transport can collapse to one global preference or default `flight`.
3. Route identity and route geometry are not durable across reload.
4. The saved trip is not a faithful representation of the generated trip.

## F-06 `P1` Day Index Semantics Remain Ambiguous in Follow-Up APIs

**Evidence**

1. `src/app/api/trips/[tripId]/items/route.ts` contains explicit comments showing uncertainty about whether `dayIndex` is 0-based or 1-based.
2. The same route tries `dayIndex === dayNumber` and then `dayIndex === dayNumber - 1`.
3. `src/app/api/itinerary/candidates/route.ts` `GET` accepts either `dayIndex` or `dayIndex + 1`.
4. `src/app/api/itinerary/candidates/route.ts` `POST` only checks `dayIndex + 1`.

**Impact**

1. The same user action can resolve a different day depending on which endpoint it hits.
2. A day-number bug in generation propagates into booking and experience-add flows.
3. The codebase does not currently have one authoritative day-number contract.

## F-07 `P1` Planner State Is Not Properly Isolated Before a Trip Exists

**Evidence**

1. `src/components/features/chat-widget-handshake.ts` `getChatId()` returns `chat-general` when there is no `tripId`.
2. `src/lib/conversation/controller.ts` stores `ConversationSession` keyed only by `id`.
3. `prisma/schema.prisma` `ConversationSession` has no `userId`.
4. `src/lib/agents/planning-agent.ts` reads and mutates `session.metadata.plannerState`.

**Impact**

1. The home-page planner can leak planner state between different users or sessions.
2. A user beginning a fresh trip can inherit stale destinations/preferences state from a previous user.
3. This undermines trust before the trip is even created.

## F-08 `P1` Agent Routing Is Still a Stub

**Evidence**

1. `src/lib/conversation/router.ts` `route()` is still `TODO`.
2. `route()` always returns `general`.
3. `general` is mapped to `PlanningAgent`.

**Impact**

1. Non-planning “general” chat shares planner state and planner tool availability.
2. The trip planner entry conditions are not explicit or deterministic.
3. This increases the chance of incorrect tool usage and inconsistent planner state transitions.

## F-09 `P1` Planner Updates Reset User Context During Generation

**Evidence**

1. `src/store/globe-slice.ts` `applyPlan()` resets `selectedDestination` to the first destination.
2. `src/lib/ai/plan-converter.ts` regenerates destination IDs and item IDs on every application.
3. `src/components/orchestrator-job-listener.tsx` applies both draft and complete plans separately.

**Impact**

1. The sidebar and map can snap back to Day 1 while the job progresses.
2. Hover/focus state is unstable because item identities change between applications.
3. Even when the underlying trip is logically the same, the UI behaves as if it is a different trip snapshot.

## F-10 `P1` Planner Jobs Are Durable in the DB but Not Recoverable in the Client

**Evidence**

1. `src/components/orchestrator-job-listener.tsx` only begins polling when `latestGenerate` exists in Redux.
2. `src/store/orchestrator-slice.ts` is purely in-memory Redux state.
3. `src/lib/agents/planner-generation.ts` `createOrchestratorJob(...)` on `main` does not persist `tripId` or `userId` metadata for planner jobs.

**Impact**

1. Refresh during generation loses client-side progress tracking.
2. The app cannot recover the active planner job from trip context alone.
3. Users can reload into an outdated trip snapshot with no indication that generation is still in progress.

## F-11 `P2` Saved Trips Summary Can Misrepresent Multi-City Trips

**Evidence**

1. `src/actions/trips.ts` `getUserTrips()` includes only the first stop.
2. `src/components/trips/trip-card.tsx` renders the first stop as the trip city.

**Impact**

1. A multi-city trip can look like a single-city trip on `/trips`.
2. Saved trip summaries reinforce the wrong mental model of what was actually generated.

## F-12 `P2` Trip Creation Still Has Two Different Contracts

**Evidence**

1. `src/actions/trips.ts` `createTrip()` can create a trip with no explicit title and optionally creates an initial stop when `city` is present.
2. `src/app/api/trips/route.ts` `POST /api/trips` requires `title` and does not create an initial stop.
3. `src/store/globe-thunks.ts` `fetchActiveTrip(undefined)` creates a default trip via `POST /api/trips` with title and dates.
4. `src/components/trips/create-trip-modal.tsx` uses the server action path instead.

**Impact**

1. A trip created from `/trips` does not start with the same shape as a trip created through the default fetch path.
2. Initial trip title, dates, and stop state depend on which entry path the user hit first.
3. This creates early drift before planner generation even begins.

## F-13 `P0` and `P1` Coverage Is Missing for the Real Authenticated Flow

**Evidence**

1. Current `main` only has `e2e/trip-creation.spec.ts` and `e2e/itinerary-editing.spec.ts`.
2. Those E2E tests are primarily homepage/demo smoke tests.
3. There is no authenticated E2E coverage for:
4. `/trips` create-trip flow
5. `/trips/[tripId]` planner generation
6. post-generation DB re-open
7. duplicate day numbering
8. day-ID sync after planner completion
9. multi-trip refresh after add/remove experience
10. route/date preservation across reload

**Impact**

1. The exact failures causing user distrust are not guarded by end-to-end tests.
2. Regressions can ship even when existing tests pass.

## 8. Required Action Plan

The phases below are mandatory and ordered. Later phases must not be marked complete before earlier phases are verified.

## Phase 1 `P0` Establish One Canonical Day and Identity Model

### Required Changes

1. Define array order as the canonical itinerary order.
2. Normalize day numbers to sequential 1..N immediately after LLM draft generation.
3. Normalize persisted day indices on DB-to-UI load before rendering.
4. Reject or repair duplicate day indices before persistence.
5. Stop generating synthetic destination/item IDs that remain user-facing after completion.

### Constraints

1. The same logical day must have exactly one label in the UI.
2. The same logical day must map to exactly one persisted `ItineraryDay`.
3. No follow-up mutation may target a synthetic placeholder day after planner completion.

### Exit Criteria

1. Duplicate `Day 10` style rendering is impossible.
2. Persistence cannot fail because of duplicate day indices generated by the planner.
3. The UI and DB always agree on which record is “Day 7”.

## Phase 2 `P0` Make the Persisted Trip the Authoritative Post-Completion Snapshot

### Required Changes

1. On planner completion, reload `/api/trips/[tripId]` and replace Redux state with the persisted trip snapshot.
2. Do not allow add/remove/book flows to operate until persisted day IDs are present.
3. Wire planner completion to day ID synchronization. Do not rely on dead/manual save thunks.
4. Ensure all follow-up reloads pass the explicit `tripId`.

### Constraints

1. The user must never continue on an ephemeral plan once persistence succeeds.
2. `fetchActiveTrip()` without a `tripId` is forbidden in follow-up mutations.

### Exit Criteria

1. The trip shown immediately after completion is byte-for-byte equivalent in meaning to the trip shown after hard refresh.
2. Adding an experience right after generation persists to the database.
3. Removing an experience cannot switch the user to a different trip.

## Phase 3 `P0` Replace the Lossy Plan Persistence Path

### Required Changes

1. Introduce a direct plan-to-write converter. Do not persist through the globe shape.
2. Extend the canonical write payload to include route data if routes are shown in the product.
3. Persist day dates when present.
4. Persist per-hop transport rather than collapsing to one global mode.
5. Ensure DB reload reconstructs the same route/day semantics the planner produced.

### Constraints

1. `plan -> persist -> reload` must preserve all user-visible fields.
2. Heuristic route rebuilding is allowed only as a fallback for missing persisted route data, not as the primary saved-trip behavior.

### Exit Criteria

1. Generated plan dates survive reload.
2. Per-hop transport survives reload.
3. Route count and route mode are stable before and after refresh.

## Phase 4 `P1` Unify Day Index Semantics in Mutation APIs

### Required Changes

1. Choose one convention for day numbering in APIs.
2. Remove dual 0-based/1-based fallback logic.
3. Require persisted day IDs wherever possible after planner completion.
4. Update candidates and items APIs to use the same lookup rule.

### Constraints

1. Comments expressing uncertainty about day semantics must be eliminated from production code.
2. A request for Day N must resolve exactly one day.

### Exit Criteria

1. Item-add and candidate creation hit the same day deterministically.
2. There is one documented day-index contract across UI, API, and DB.

## Phase 5 `P1` Isolate Planner Sessions and Fix Routing

### Required Changes

1. Scope `ConversationSession` by user and session/trip, not by global string alone.
2. Eliminate the shared `chat-general` planner metadata row.
3. Implement actual routing or require explicit route intent from the caller.
4. Ensure general chat cannot accidentally inherit planner state.

### Constraints

1. No traveler may see or inherit another traveler’s planner metadata.
2. Planner state mutations must be attributable to one user/session context.

### Exit Criteria

1. Starting a new trip from the homepage is isolated per user/session.
2. `AgentRouter.route()` is no longer a stub for traveler flows.

## Phase 6 `P0` and `P1` Coverage Gate

### Required Automated Coverage

1. Unit test: duplicate day numbers normalize to sequential labels.
2. Unit test: persisted duplicate day indices normalize on load.
3. Unit test: direct plan-to-write conversion preserves dates and per-hop transport.
4. Unit test: `addExperienceToTrip` and `removeExperienceFromTrip` reload the explicit trip ID.
5. Unit test: `ConversationSession` scoping cannot collide on `chat-general`.
6. E2E: `/trips` create-trip modal -> `/trips/[tripId]` -> generate itinerary -> completion -> hard refresh -> same itinerary.
7. E2E: add experience immediately after planner completion persists after refresh.
8. E2E: multi-trip user edits Trip B and remains on Trip B.
9. E2E: duplicate planner day output does not render duplicate day labels.
10. E2E: route/date semantics survive reopen from `/trips`.

### Exit Criteria

1. No phase above is complete until the corresponding tests exist and pass.

## 9. Binary Acceptance Criteria

This remediation is complete only when every statement below is true.

1. A generated trip and the same trip after hard refresh are materially identical.
2. Duplicate or skipped day numbers cannot reach the rendered UI.
3. Follow-up itinerary mutations always target persisted day IDs.
4. Add/remove experience never reloads a different trip.
5. Dates and per-hop transport survive planner persistence and reload.
6. Planner state is isolated per user/session context.
7. The authenticated `/trips` create -> generate -> save -> reopen flow is covered by E2E.

## 10. Immediate Priority Order

If this work must be split, the implementation order is:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6

Do not ship broader friends-and-family testing from `main` until Phases 1 through 3 are complete.
