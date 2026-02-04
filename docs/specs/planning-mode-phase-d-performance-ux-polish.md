# Ticket: Planning Mode Phase D - Performance + UX Polish

## Goal
Ship the locked Planning Mode UX at production quality while preserving responsiveness for larger itineraries and host datasets.

## Scope
- Implement the final surface behaviors (map-first with list sheet + itinerary access).
- Improve render performance for map markers and list rendering.
- Enforce mobile/desktop behavior and z-index invariants.

## In Scope
- Bottom sheet/list surface behavior across breakpoints.
- Itinerary sidebar/drawer behavior across breakpoints.
- Marker clustering/culling improvements for Cesium surface.
- Lightweight list virtualization/windowing for large result sets.
- Final z-index layering and dismissal behavior.

## Out of Scope
- API contract changes.
- New planning features beyond the locked architecture.
- Booking flow redesign.

## Implementation Tasks
1. Update `src/components/features/globe-itinerary.tsx` layout composition to match locked hierarchy:
   - map base layer
   - itinerary surface
   - list sheet surface
   - overlays
2. Refine `src/components/features/experience-drawer.tsx` behavior into sheet-style interaction model (start height, collapse/minimize, dismiss behavior).
3. Ensure itinerary responsiveness in `src/components/features/itinerary-sidebar.tsx` and parent layout:
   - desktop: persistent/collapsible
   - mobile: drawer behavior
4. Improve map marker render path in `src/components/features/cesium-globe.tsx`:
   - marker clustering at low zoom
   - viewport-aware marker filtering
5. Add extracted helpers for clustering/windowing in `src/lib/map/` and `src/lib/planning/` to keep component logic testable.
6. Enforce z-index and conflict invariants:
   - AI chat > list sheet > itinerary > map
   - list open state and popper dismissal remain deterministic

## Acceptance Criteria (Binary)
- [ ] Desktop and mobile planning surfaces match locked behavior and remain usable end-to-end.
- [ ] List sheet no longer obscures core map context by default.
- [ ] Marker/list rendering remains responsive with larger datasets (no visible interaction stalls under normal usage).
- [ ] Z-index order and dismissal behavior match architecture invariants.
- [ ] Unit and Playwright coverage for layout/performance-sensitive flows is added/updated and passing.

## Required Tests
- `src/lib/map/marker-clustering.test.ts`
  - cluster split/merge behavior by zoom threshold
- `src/lib/planning/list-windowing.test.ts`
  - visible range calculations
- `e2e/itinerary-editing.spec.ts`
  - list sheet open/close and itinerary availability
- `e2e/error-handling.spec.ts`
  - surface dismissal and recovery behavior
- `e2e/profile.spec.ts` (if host profile handoff is impacted by surface layering)

## Touched Files
- `src/components/features/globe-itinerary.tsx`
- `src/components/features/cesium-globe.tsx`
- `src/components/features/experience-drawer.tsx`
- `src/components/features/itinerary-sidebar.tsx`
- `src/components/features/host-panel.tsx`
- `src/lib/map/marker-clustering.ts`
- `src/lib/planning/list-windowing.ts`
- `src/lib/map/marker-clustering.test.ts`
- `src/lib/planning/list-windowing.test.ts`
- `e2e/itinerary-editing.spec.ts`
- `e2e/error-handling.spec.ts`
- `e2e/profile.spec.ts`

## Dependencies
- Requires Phase B interaction normalization and Phase C API normalization.

## Estimate
- 3-5 engineering days.
