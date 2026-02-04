# Ticket: Planning Mode Phase A - State Contract Hardening

## Goal
Implement the Planning Mode state contract exactly as defined in the implementation-ready architecture spec.

## Scope
- Add missing Planning Mode state fields.
- Add selectors for canonical filtered datasets.
- Keep behavior backward compatible with current screens.

## In Scope
- `planningViewMode` in globe state.
- `selectedHostId` and `selectedExperienceId` in globe state.
- `activeFilters` in globe state.
- `isListSurfaceOpen` and `isItineraryCollapsed` in UI state.
- Selector utilities for visible host/experience IDs.

## Out of Scope
- UI layout rewrites.
- API changes.
- Performance optimization.

## Implementation Tasks
1. Extend `GlobeState` in `src/store/globe-slice.ts` with required Planning Mode fields.
2. Add reducer actions for:
   - setting/clearing selected host/experience
   - setting planning view mode
   - setting/resetting active filters
3. Extend `UIState` in `src/store/ui-slice.ts` with list/itinerary surface visibility controls.
4. Add/selectors for canonical filtered host/experience IDs.
5. Update `src/store/store.ts` type expectations if needed.

## Acceptance Criteria (Binary)
- [ ] All required fields exist in Redux state with deterministic defaults.
- [ ] Actions exist for all state transitions defined in the spec.
- [ ] Existing app routes still compile and run without runtime regression.
- [ ] Unit tests added/updated and passing.

## Required Tests
- `src/store/globe-slice.test.ts`
  - defaults
  - selection set/clear
  - view mode transitions
  - filter set/reset
- `src/store/ui-slice.test.ts`
  - list surface open/close
  - itinerary collapse toggle

## Touched Files
- `src/store/globe-slice.ts`
- `src/store/ui-slice.ts`
- `src/store/store.ts` (if required)
- `src/store/globe-slice.test.ts`
- `src/store/ui-slice.test.ts`

## Dependencies
- None (starting ticket).

## Estimate
- 1-2 engineering days.

