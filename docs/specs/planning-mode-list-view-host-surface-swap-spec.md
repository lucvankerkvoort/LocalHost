# Technical Specification: Planning Mode List Surface Host Swap

Status: Draft for implementation
Owner: Planning Mode
Date: 2026-02-04

## 1) Objective

Replace the current right-side persistent `HostPanel` with a List View surface that uses the same host/experience content, and remove itinerary-side "Add to Day [X]" entrypoints.

This spec also resolves the current failure mode where List View appears empty while the right-side host panel contains data.

## 2) Scope

### In Scope
- Remove persistent right-side host sidebar from map layout.
- Make List View the single host/experience browsing surface.
- Position the List View toggle button at the top-center of globe viewport.
- Remove `+ Add to Day [X]` buttons from itinerary day cards.
- Swap List View data source to use the same dataset as host browsing on map (not city string lookup).
- Keep map/list interaction parity and selection persistence.

### Out of Scope
- API contract redesign.
- Booking flow redesign.
- New filtering features beyond existing state contract.
- Multi-stop anchor model changes.

## 3) Current Issues (Critical Findings)

1. **Data pipeline mismatch**
   - `HostPanel` uses map/nearby host pipeline and shows data.
   - List surface (`ExperienceDrawer`) uses `getHostsByCity(city)` static city-matching lookup.
   - Result: List can be empty even when map host pipeline has hosts.

2. **Competing discovery surfaces**
   - Users can discover experiences via right sidebar and list drawer simultaneously.
   - Violates "one primary discovery surface at a time" interaction model.

3. **Duplicate add entrypoints**
   - Itinerary day cards expose `+ Add to Day [X]`.
   - This conflicts with list/map-first discovery intent and adds competing UX paths.

4. **Control placement mismatch**
   - List View toggle currently appears in right-aligned control stack.
   - Requirement is top-center placement in globe viewport.

## 4) Locked Product Behavior

1. **Single browsing surface**
   - Host/experience browsing exists only in List View sheet.
   - Right-side persistent `HostPanel` is removed.

2. **List View content parity**
   - List View must render host/experience content that is currently visible in map host browsing pipeline.
   - If host data is visible in map mode, list must not be empty for the same context.

3. **Itinerary entrypoint simplification**
   - Remove day-card inline `+ Add to Day [X]`.
   - Add flow occurs from map popper or list items only.

4. **Control placement**
   - `List View` toggle button is centered horizontally at top of globe viewport.
   - Z-index must keep it clickable above list sheet overlays.

## 5) Implementation Design

## 5.1 Surface Architecture

- `globe-itinerary.tsx` remains orchestrator.
- `HostPanel` content migrates into List View container usage.
- `ExperienceDrawer` city-only source path is removed or replaced.

Recommended implementation:
- Reuse `HostPanel` for list content rendering inside the list surface container.
- Deprecate city-lookup path in `ExperienceDrawer`, or convert it to a generic shell receiving hosts as props.

## 5.2 Data Contract (Required)

List View input must be passed from `globe-itinerary.tsx` as:
- `hostsForList = nearbyHosts.length > 0 ? nearbyHosts : hostMarkers`
- `selectedHostId`
- `selectedDayNumber`
- `addedExperienceIds`
- `bookedExperienceIds`

List View must not call `getHostsByCity` internally.

## 5.3 Interaction Rules

- Opening list:
  - sets `planningViewMode = LIST`
  - sets `isListSurfaceOpen = true`
  - closes map popper/host selection
- Closing list:
  - sets `planningViewMode = MAP`
  - sets `isListSurfaceOpen = false`
- Selecting an experience from list:
  - sets selected host + selected experience
  - map focuses to host/experience coordinates
  - list closes to map-focused state (current parity behavior)
- Add/remove/booked CTA behavior remains identical between map and list surfaces.

## 5.4 Itinerary UI Changes

In `ItineraryDayColumn`:
- Remove rendering of add button:
  - current label: `Add to Day {dayNumber}`
- Keep day selection and item interactions intact.
- Do not remove book actions.

## 5.5 Top Control Placement

In `globe-itinerary.tsx`:
- Move `List View` control to dedicated centered container:
  - `absolute top-4 left-1/2 -translate-x-1/2`
- Keep control clickable in both map and list states.
- Ensure list sheet does not intercept pointer events over this control.

## 6) File-Level Change Plan

- `src/components/features/globe-itinerary.tsx`
  - remove persistent right sidebar usage
  - wire list surface to map host pipeline data
  - move list toggle to centered top control
  - keep selection/focus handlers shared

- `src/components/features/host-panel.tsx`
  - keep as canonical host/experience list component
  - verify list container usage works without right-sidebar assumptions

- `src/components/features/experience-drawer.tsx`
  - remove city-source coupling (`getHostsByCity`) or replace with shell receiving host props

- `src/components/features/itinerary-day.tsx`
  - remove inline add button rendering

- `src/components/features/cesium-globe.tsx`
  - no behavior change required beyond preserving background-click clear behavior

- `e2e/itinerary-editing.spec.ts`
  - update/add assertions for:
    - no right-side host sidebar in map mode
    - list view contains host content
    - itinerary has no add-to-day button
    - centered toggle remains usable with list open

## 7) Acceptance Criteria (Binary)

- [ ] Right-side persistent `HostPanel` is no longer rendered in map mode.
- [ ] Opening List View shows host/experience content sourced from map host pipeline.
- [ ] List View is not empty when map host browsing has visible hosts for the active context.
- [ ] `+ Add to Day [X]` is absent from itinerary day cards.
- [ ] List View toggle is visually top-center and remains clickable when list is open.
- [ ] Experience selection and add/remove/booked behavior remains parity between map/list.
- [ ] Typecheck and targeted tests pass.

## 8) Required Test Coverage

Unit/integration:
- `src/store/globe-slice.test.ts` (existing parity state remains valid)
- Component-level assertions as available for itinerary-day add-button removal

Playwright:
- `e2e/itinerary-editing.spec.ts`
  - list contains host cards when map host data exists
  - map popper closes when list opens
  - no `Add to Day` buttons in itinerary
  - centered list toggle remains usable in both modes

## 9) Risks and Constraints

- Existing host card component depends on host enrichment availability; missing host profile joins can cause blank rows if not handled.
- Removing itinerary add buttons shifts all add intent to map/list; onboarding clarity should be monitored.
- Control z-index must be explicitly managed to avoid sheet pointer interception regressions.

## 10) Implementation Sequence

1. Remove right-side host panel rendering from `globe-itinerary.tsx`.
2. Rewire list surface to receive `hostsForList` from map host pipeline.
3. Remove city-lookup list data path (`getHostsByCity`) from list flow.
4. Remove itinerary add buttons.
5. Move list toggle to top-center and verify pointer priority.
6. Update E2E tests and validate interaction parity.

