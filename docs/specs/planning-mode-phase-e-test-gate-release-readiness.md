# Ticket: Planning Mode Phase E - Test Gate + Release Readiness

## Goal
Complete Planning Mode with explicit quality gates, release checks, and regression protection before rollout.

## Scope
- Close testing gaps for locked planning invariants.
- Define and run release gate checks.
- Prepare rollout/rollback and post-release verification.

## In Scope
- Unit test completion for planning reducers/helpers introduced in Phases A-D.
- Playwright coverage for map/list parity, persistence, and mobile surface behavior.
- Lint/typecheck/test gate execution and evidence capture.
- Release checklist documentation for production readiness.

## Out of Scope
- New product features.
- Post-launch optimization work not required to pass release gate.

## Implementation Tasks
1. Add dedicated Planning Mode Playwright coverage:
   - map/list parity
   - selection persistence across view toggles
   - mobile itinerary/list coexistence
   - clean selection dismissal on map background click
2. Backfill or finalize unit coverage for reducers/helpers added during Phases A-D.
3. Create release checklist document with binary pass/fail checks and required evidence links.
4. Run full verification sequence:
   - `npm run lint`
   - `npm run test`
   - targeted Playwright planning suites
5. Capture known risks and any deferred items explicitly before merge.

## Acceptance Criteria (Binary)
- [ ] Planning Mode invariants are covered by automated unit + E2E tests.
- [ ] Lint, typecheck/test workflow, and targeted Playwright suites pass without manual patching.
- [ ] Release checklist exists and is complete with pass/fail evidence.
- [ ] No open P0/P1 regressions remain in planning discovery/add flows.
- [ ] Rollout and rollback notes are documented.

## Required Tests
- `src/store/globe-slice.test.ts`
- `src/store/ui-slice.test.ts`
- `src/lib/map/marker-clustering.test.ts`
- `src/lib/planning/list-windowing.test.ts`
- `e2e/planning-mode-map-list-parity.spec.ts`
- `e2e/planning-mode-selection-persistence.spec.ts`
- `e2e/planning-mode-mobile-surfaces.spec.ts`

## Touched Files
- `e2e/planning-mode-map-list-parity.spec.ts`
- `e2e/planning-mode-selection-persistence.spec.ts`
- `e2e/planning-mode-mobile-surfaces.spec.ts`
- `e2e/fixtures.ts` (if new helpers are needed)
- `src/store/globe-slice.test.ts`
- `src/store/ui-slice.test.ts`
- `src/lib/map/marker-clustering.test.ts`
- `src/lib/planning/list-windowing.test.ts`
- `docs/specs/planning-mode-release-checklist.md`

## Dependencies
- Requires completion of Phases A-D.

## Estimate
- 1-2 engineering days.
