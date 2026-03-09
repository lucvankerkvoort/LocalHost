# Planner Trust Remediation Tracker

**Status:** Proposed / Not Started  
**Scope:** Trip planning trust, consistency, and durability  
**Related:** [main-branch-trip-planning-flow-audit-and-action-plan.md](/Users/lucvankerkvoort/Documents/LocalHost/docs/specs/main-branch-trip-planning-flow-audit-and-action-plan.md)

## 1. Authoring Conformance

This document is authored to the `AGENTS.md` `Architect` contract.

The `Technical Specification Authoring (Constraint-Driven)` skill referenced by `AGENTS.md` is not available in this session. This tracker therefore follows the same contract directly:

1. Explicit scope
2. Explicit exclusions
3. Explicit invariants
4. Explicit workstreams
5. Explicit test requirements
6. Binary acceptance criteria

## 2. Problem Statement

The planner currently allows user-visible divergence between:

1. The draft plan shown during generation
2. The completed job plan returned by the orchestrator
3. The persisted trip loaded from the database
4. The follow-up mutation targets used by add/remove/edit flows

This divergence causes:

1. Titles and images changing after the progress bar finishes
2. Descriptions being replaced by addresses
3. Day numbering mismatches and duplicate days
4. Local-only edits that disappear after refresh
5. Trips reloading into a different state than the user just saw

This is a trust failure, not a cosmetic issue.

## 3. Scope

This tracker covers the full traveler flow:

1. Start a trip on `/trips/[tripId]`
2. Generate a draft itinerary
3. Complete itinerary hydration and persistence
4. Render the completed trip in the planner UI
5. Refresh the page
6. Open the trip later from saved trips
7. Perform follow-up itinerary mutations
8. Reopen the trip again and verify persistence

## 4. Exclusions

This tracker does not cover:

1. Host onboarding
2. Payments
3. Visual redesign unrelated to trust and consistency
4. Ranking quality of candidate experiences except where it changes persistence or identity
5. Non-planner chat UX except where it leaks planner state across users or trips

## 5. Non-Negotiable Invariants

## INV-01 Canonical Completion

After planner completion, the active planner UI must converge to the persisted database trip before the user performs follow-up mutations.

## INV-02 Single Description Contract

`item.description` is user-facing descriptive copy.  
`place.address` is location text.  
`place.description` must not be used as a disguised address field.

## INV-03 Stable User-Visible Identity

Within one trip session, once the completed persisted trip is shown:

1. Day numbering must not change without an explicit user edit
2. Item titles must not change without an explicit user edit
3. The itinerary card image for a given item may change at most once from placeholder to final image
4. Real images must not swap to different real images during ordinary planner completion

## INV-04 Canonical Day Ordering

Day order must be unique, sequential, and consistent across:

1. Planner output
2. Redux/UI state
3. Database rows
4. Saved-trip reload

## INV-05 Persisted Mutation Targets

Add, remove, reorder, and edit operations must target persisted `tripId`, `dayId`, and persisted item IDs once the planner reaches completed state.

## INV-06 Explicit Trip Reload

Any post-mutation reload must reload the same `tripId` that was mutated.

## INV-07 Single Day Lookup Semantics

The system must choose one canonical day mutation target.  
Preferred target: `dayId`.  
Fallback acceptance of both 0-based and 1-based day numbers is forbidden.

## INV-08 Server-Owned Job Execution

The browser may start a planner job and observe planner job state.  
The browser must not be responsible for advancing planner jobs through worker-internal endpoints such as `tick`, `advance`, or equivalent.

## 6. What Must Not Change

The remediation work must preserve these behaviors:

1. `/trips/[tripId]` remains the canonical traveler route for an existing trip
2. Planner generation still exposes progress to the user
3. The user can see an early draft preview before full completion
4. Existing saved trips remain openable through the saved trips UI
5. Trip mutations remain trip-scoped and authenticated

## 7. Workstream Tracker

Completion rule for every workstream:

1. Implementation is incomplete until the listed tests exist
2. Implementation is incomplete until the listed acceptance criteria pass
3. A workstream checkbox may be checked only when its acceptance criteria are satisfied in code and tests

### WS-01 Draft and Completion Render Contract

**Status:** [ ] Not Started

**Objective**

Separate draft preview behavior from completed persisted-trip behavior so the user does not see unstable titles, unstable images, or synthetic final state.

**Required Changes**

1. Draft state must be treated as preview-only.
2. While a planner job is non-terminal, itinerary cards may show:
   - day number
   - day title
   - city
   - draft activity title
   - progress state
3. While a planner job is non-terminal, itinerary cards must not show final resolved thumbnails.
4. When the job reaches `complete`, the client must fetch the persisted trip for the active `tripId`.
5. The UI must replace the preview state with the persisted-trip state before follow-up edits are enabled.
6. The completed planner UI must not continue to rely on synthetic orchestrator IDs.

**Constraints**

1. `job.plan` may be used to render draft progress.
2. `job.plan` must not remain the canonical source of truth after completion.
3. The user must not be able to add or remove itinerary items against synthetic day IDs after the completed state is entered.

**Primary Touchpoints**

1. `src/components/orchestrator-job-listener.tsx`
2. `src/lib/agents/planner-generation.ts`
3. `src/store/globe-slice.ts`
4. `src/store/globe-thunks.ts`
5. `src/components/features/globe-itinerary.tsx`

**Test Requirements**

1. Unit test: completed job listener dispatches persisted trip fetch for the active `tripId`
2. Unit test: follow-up mutation controls remain disabled until persisted IDs are present
3. E2E test: generate trip, wait for completion, refresh, verify same days/items remain visible

**Acceptance Criteria**

1. After the progress bar completes, the itinerary UI is sourced from `/api/trips/[tripId]`, not from `job.plan`
2. A refresh immediately after completion shows the same trip content the user just saw
3. Follow-up mutations are impossible until persisted `dayId` values are present

### WS-02 Description, Address, Title, and Image Field Contract

**Status:** [ ] Not Started

**Objective**

Make itinerary cards render the correct text fields and eliminate address-as-description behavior.

**Required Changes**

1. `formattedAddress` from place resolution must map to `place.address`.
2. `item.description` must remain the user-facing itinerary note.
3. `place.description` may contain descriptive place copy only if such copy exists.
4. Itinerary card rendering must prefer:
   - description line: `item.description`
   - fallback description line: `place.description`
   - location line: `place.address`, then `place.city`, then explicit location fallback
5. Draft thumbnails must be placeholders only.
6. Post-complete list-image hydration may begin only after persisted trip load completes.
7. If list-image hydration runs after persisted load, the visible card image may transition only from placeholder to final image, never from one real image to another.

**Constraints**

1. No card may show a formatted street address in the description paragraph unless the itinerary note is actually absent and no descriptive copy exists.
2. The completion transition must not replace a visible real image with a different real image.
3. Resolved place names may replace draft activity names only before the persisted-trip state is shown. After persisted-trip load, titles must remain stable.

**Primary Touchpoints**

1. `src/lib/ai/orchestrator.ts`
2. `src/lib/ai/plan-converter.ts`
3. `src/components/features/itinerary-day.tsx`
4. `src/components/features/globe-itinerary.tsx`
5. `src/lib/images/places.ts`

**Test Requirements**

1. Unit test: place hydration writes address to `place.address`, not `place.description`
2. Unit test: itinerary card description prefers `item.description`
3. Unit test: background image hydration does not start during active planner job
4. E2E test: generate trip and verify description paragraph contains itinerary note, not formatted address

**Acceptance Criteria**

1. The address renders on the location line, not as the description paragraph
2. Draft thumbnails do not flicker into one image and then swap to another before persisted load
3. After persisted load, item titles and visible thumbnails remain stable unless the user edits the trip

### WS-03 Canonical Day Sequencing

**Status:** [ ] Not Started

**Objective**

Normalize day ordering so duplicate days, skipped days, and ambiguous day lookups cannot survive generation, persistence, or reload.

**Required Changes**

1. Introduce one canonical day sequencing rule:
   - itinerary order defines canonical day order
   - canonical day numbers are `1..N`
2. Apply normalization:
   - immediately after draft generation
   - before UI conversion
   - before persistence
   - when loading persisted trips
3. Duplicate or non-sequential incoming day numbers from the model must be rewritten to canonical sequence.
4. Any reference to a day by number must use the canonical sequence only.

**Constraints**

1. A trip must never render duplicate day numbers in the completed UI.
2. A persisted trip must never load with day numbering that differs from the planner-complete UI.
3. Day numbering must be derived from order, not trusted raw model output.

**Primary Touchpoints**

1. `src/lib/ai/orchestrator.ts`
2. `src/lib/ai/plan-converter.ts`
3. `src/lib/api/trip-converter.ts`
4. persistence conversion code paths

**Test Requirements**

1. Unit test: duplicate model day numbers normalize to `1..N`
2. Unit test: persisted trip reload preserves canonical day ordering
3. E2E test: generate a multi-day trip and verify no duplicate day labels appear in planner or saved-trip reopen flow

**Acceptance Criteria**

1. Duplicate day numbers cannot appear in completed UI
2. Day `N` in planner-complete view matches day `N` after refresh and reopen
3. All day-number-based regressions are covered by automated tests

### WS-04 Persisted IDs and Follow-Up Mutation Correctness

**Status:** [ ] Not Started

**Objective**

Ensure all follow-up itinerary mutations target persisted rows and reload the correct trip.

**Required Changes**

1. Add/remove/edit/reorder flows must require explicit `tripId`.
2. Completed planner state must carry persisted `dayId` values before mutation controls are enabled.
3. Temporary or synthetic day IDs must not be accepted by post-completion mutation flows.
4. Post-mutation reloads must call `fetchActiveTrip(tripId)` with the exact mutated trip ID.
5. Any fallback behavior that reloads “current trip” or “first trip” is forbidden for post-mutation sync.

**Constraints**

1. No mutation may silently downgrade to local-only state after completion.
2. Multi-trip accounts must never reload a different trip after a mutation.
3. A successful visual mutation must correspond to a persisted mutation target.

**Primary Touchpoints**

1. `src/store/globe-thunks.ts`
2. `src/store/globe-slice.ts`
3. mutation API routes under `src/app/api/trips/[tripId]/`

**Test Requirements**

1. Unit test: add experience rejects or disables synthetic day IDs after completion
2. Unit test: remove experience reloads the explicit mutated trip
3. E2E test: edit Trip B while Trip A exists; verify Trip B remains active after mutation and refresh

**Acceptance Criteria**

1. No follow-up mutation is local-only once the trip is completed
2. Post-mutation refresh preserves the change
3. Editing one trip never reloads a different trip

### WS-05 Planner Persistence and Read Contract

**Status:** [ ] Not Started

**Objective**

Remove lossy conversions so persisted trips faithfully round-trip all user-visible itinerary data.

**Required Changes**

1. Define one canonical planner write contract that preserves:
   - day numbers
   - day titles
   - dates
   - anchor/city data
   - item coordinates
   - item description
   - item address
   - inter-city transport
   - route data if displayed after reload
2. The planner persistence path must write from the canonical planner model to the DB contract directly or via a lossless converter.
3. The trip read path must map persisted data back to the planner UI without inventing materially different fields.
4. Saved trip cards and saved trip reopen flow must use the same persisted source.

**Constraints**

1. No user-visible field may disappear between planner-complete view and saved-trip reopen.
2. Heuristic route reconstruction is forbidden if the route is claimed to be persisted.
3. Dates must not be dropped if the planner produced them.

**Primary Touchpoints**

1. `src/lib/agents/planner-generation.ts`
2. `src/lib/ai/plan-converter.ts`
3. `src/lib/api/trip-converter.ts`
4. `src/lib/trips/contracts/trip-plan.schema.ts`
5. `src/lib/trips/repository.ts`

**Test Requirements**

1. Unit test: planner-produced dates survive save and reload
2. Unit test: inter-city transport survives save and reload
3. Unit test: description/address fields survive save and reload distinctly
4. E2E test: generate, save, reopen, verify same titles/dates/notes remain visible

**Acceptance Criteria**

1. Planner-complete UI and saved-trip reopen show the same user-visible trip content
2. No persisted field is silently dropped across save/reload
3. Read and write conversion tests cover all planner-visible fields

### WS-06 Day Mutation API Contract Cleanup

**Status:** [ ] Not Started

**Objective**

Remove ambiguous 0-based vs 1-based day lookup behavior from mutation APIs.

**Required Changes**

1. Canonical mutation target must be `dayId`.
2. If temporary compatibility is needed, compatibility may exist only at the request boundary and must normalize to one canonical lookup immediately.
3. Internal logic must not try both `dayIndex` and `dayIndex + 1`.
4. Candidate APIs and item mutation APIs must share the same day-target contract.

**Constraints**

1. Dual-acceptance day lookup logic is forbidden in steady state.
2. Comments expressing uncertainty about 0-based vs 1-based semantics must be eliminated by code, not retained as documentation.

**Primary Touchpoints**

1. `src/app/api/trips/[tripId]/items/route.ts`
2. `src/app/api/itinerary/candidates/route.ts`
3. any shared day lookup helpers introduced during implementation

**Test Requirements**

1. Unit test: day lookup resolves by `dayId`
2. Unit test: wrong day target fails deterministically
3. E2E test: add candidate to selected day and verify it appears in the same day after refresh

**Acceptance Criteria**

1. Day mutation APIs use one canonical target
2. No API path relies on “try both indexing systems”
3. Wrong-day insertions cannot occur because of index ambiguity

### WS-07 Session and Job Ownership

**Status:** [ ] Not Started

**Objective**

Ensure planner jobs and session state are trip-scoped, user-scoped, and server-owned.

**Required Changes**

1. Planner execution ownership must remain server-side.
2. The client API surface for planner jobs is limited to:
   - start job
   - observe job
   - optional cancel job
3. Worker-internal endpoints such as `tick`, `advance`, or equivalent client-driven execution hooks are forbidden.
4. Planner session identity before a trip exists must be user-scoped and must not leak across travelers.
5. Job recovery after refresh must depend on persisted job and trip state, not in-memory Redux only.

**Constraints**

1. A tab refresh must not erase the system’s ability to observe an in-flight job.
2. A user must not inherit another user’s general planner session.
3. The client must never be responsible for pushing a job forward one step at a time.

**Primary Touchpoints**

1. `src/components/features/chat-widget-handshake.ts`
2. `src/lib/conversation/controller.ts`
3. `src/lib/conversation/router.ts`
4. `src/lib/agents/generation-controller.ts`
5. `src/lib/ai/orchestrator-jobs.ts`
6. `src/app/api/orchestrator/route.ts`

**Test Requirements**

1. Unit test: planner session identity is user-scoped and trip-scoped
2. Unit test: job observation can resume after refresh with persisted `jobId`
3. E2E test: refresh during in-flight generation and verify progress/completion recovers to the same trip

**Acceptance Criteria**

1. Planner jobs are start-and-observe only from the client perspective
2. Refresh does not orphan in-flight planner jobs
3. Session identity is not shared across unrelated trips or users

## 8. Execution Order

The workstreams must be completed in this order:

1. WS-01 Draft and Completion Render Contract
2. WS-02 Description, Address, Title, and Image Field Contract
3. WS-03 Canonical Day Sequencing
4. WS-04 Persisted IDs and Follow-Up Mutation Correctness
5. WS-05 Planner Persistence and Read Contract
6. WS-06 Day Mutation API Contract Cleanup
7. WS-07 Session and Job Ownership

Rationale:

1. WS-01 and WS-02 remove the most visible trust failures first
2. WS-03 and WS-04 fix identity correctness required for safe follow-up edits
3. WS-05 makes persistence and reopen behavior faithful
4. WS-06 removes remaining wrong-day mutation ambiguity
5. WS-07 hardens the architecture after the user-visible trust issues are stabilized

## 9. Required Verification Matrix

The remediation is incomplete until the following end-to-end scenarios pass:

1. Generate a new trip, wait for completion, and verify the completed planner view is stable
2. Refresh immediately after completion and verify the same trip content loads
3. Open the same trip from saved trips and verify the same days/items appear
4. Add an experience to a specific day and verify the same day contains it after refresh
5. Remove an experience and verify it remains removed after refresh
6. Generate a multi-city trip and verify day numbering remains sequential across planner, refresh, and reopen
7. Run the same flow with at least two saved trips and verify no cross-trip reload occurs

## 10. Definition of Done

This remediation is complete only when all of the following are true:

1. All seven workstreams are checked complete
2. Unit coverage exists for every changed conversion, identity, and mutation boundary
3. Authenticated E2E coverage exists for generate, complete, refresh, reopen, and mutate flows
4. The planner-complete UI matches the persisted trip shown after refresh and reopen
5. No client-driven worker advancement endpoint exists in the planner architecture

