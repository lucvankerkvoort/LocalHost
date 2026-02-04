# Ticket: Planning Mode Phase B - Interaction Normalization

## Goal
Make Map and List interactions behaviorally identical and state-driven across Planning Mode surfaces.

## Scope
- Normalize selection/focus/add flows so all entry points use one interaction contract.
- Enforce locked interaction rules from the planning architecture spec.
- Keep existing booking and messaging behavior intact.

## In Scope
- Shared selection transitions for host and experience clicks.
- Shared "add to day" transition from map popper and list sheet.
- `MAP`/`LIST` mode toggle wiring to state from Phase A.
- Surface conflict handling (list opens -> map popper closes).
- Auto-expand itinerary sidebar after successful add.

## Out of Scope
- API schema changes.
- Map rendering performance work.
- Itinerary drag-and-drop/reordering.

## Implementation Tasks
1. Refactor interaction handlers in `src/components/features/globe-itinerary.tsx` into a single planning interaction flow (select host, focus experience, add experience, clear selection).
2. Update `src/components/features/host-panel.tsx` and `src/components/features/experience-drawer.tsx` so they dispatch through the same callback contract.
3. Wire list/map visibility and itinerary collapse behavior to Redux (`src/store/globe-slice.ts`, `src/store/ui-slice.ts`) instead of local-only branching.
4. Enforce dismissal and conflict invariants:
   - opening list closes map popper
   - clicking map background clears selected experience
   - switching `MAP`/`LIST` preserves selected experience and active day
5. Ensure CTA copy is consistent across surfaces (`Add to Day X`, `Remove from Day`, `Booked`).

## Acceptance Criteria (Binary)
- [ ] Selecting an experience from List and Map triggers the same focus state and camera target.
- [ ] Switching between `MAP` and `LIST` does not clear selected experience/day.
- [ ] Opening list view always closes active map popper.
- [ ] Adding an experience auto-expands itinerary sidebar/drawer to show the update.
- [ ] Unit and Playwright tests covering interaction parity are added/updated and passing.

## Required Tests
- `src/store/globe-slice.test.ts`
  - selected experience persistence across view changes
  - selection clear behavior
- `src/store/ui-slice.test.ts`
  - list open/close conflict with popper state
  - itinerary auto-expand on add
- `src/components/features/host-panel-state.test.ts`
  - CTA parity states across add/remove/booked paths
- `e2e/itinerary-editing.spec.ts`
  - list click parity with map click
  - view switching retains context

## Touched Files
- `src/components/features/globe-itinerary.tsx`
- `src/components/features/host-panel.tsx`
- `src/components/features/experience-drawer.tsx`
- `src/store/globe-slice.ts`
- `src/store/ui-slice.ts`
- `src/store/globe-slice.test.ts`
- `src/store/ui-slice.test.ts`
- `e2e/itinerary-editing.spec.ts`

## Dependencies
- Requires Phase A state fields and reducers.

## Estimate
- 2-3 engineering days.
