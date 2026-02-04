# Technical Specification: Itinerary Panel Tabs (Itinerary + Experiences)

Status: Locked
Owner: Planning Mode
Date: 2026-02-04

## 1) Objective

Move experience discovery into the itinerary panel by introducing two tabs:
- `Itinerary`
- `Experiences`

This keeps "add to day" actions tightly coupled to day context and removes the need for a separate list-view surface.

## 2) Problem Statement

Current behavior makes discovery and day assignment feel disconnected:
- Users browse experiences in a separate surface.
- Adding requires implicit day context.
- The primary user intent is planning by day, so discovery should remain anchored to day selection.

## 3) Scope

### In Scope
- Add tabbed UI inside itinerary panel.
- Embed host/experience browsing in `Experiences` tab.
- Introduce explicit day-selection controls within `Experiences` tab.
- Route all add/remove/booked actions through selected day context.
- Remove list-view toggle and bottom-sheet dependency.

### Out of Scope
- API schema changes.
- Booking lifecycle changes.
- Multi-stop anchor model updates.

## 4) UX Behavior (Locked)

## 4.1 Panel Tabs
- Panel header includes tabs:
  - `Itinerary` (default)
  - `Experiences`
- Tab switch preserves:
  - selected day
  - selected host
  - selected experience
- Responsive behavior:
  - Desktop: tabs render in the itinerary panel header.
  - Mobile: tabs render as full-width top tabs inside a drawer surface.

## 4.2 Day Context in Experiences Tab
- Experiences tab displays a day context control at top:
  - Desktop: horizontal day chips (`Day 1`, `Day 2`, ...)
  - Small screens: day dropdown selector
  - selected value mirrors `selectedDestination`
- If no day is selected, auto-select first available day.
- Add CTA must always be explicit: `Add to Day X`.

## 4.3 Add/Remove/Booked Rules
- `Add to Day X`: adds to currently selected day.
- `Remove from Day`: removes from currently selected day if present.
- `Booked`: disabled state, no mutation.

## 4.4 Map Interaction
- Map remains visible as main canvas.
- Selecting an experience from `Experiences` tab focuses map and keeps tab state.
- Map popper is removed from planning mode (no host popper add flow).

## 5) Architecture & State

## 5.1 Reused Existing State
- `globe.selectedDestination` = active day context.
- `globe.selectedHostId`, `globe.selectedExperienceId` = shared selection.
- `ui.isItineraryCollapsed` = panel collapsed behavior.

## 5.2 New UI State
- Add to `ui-slice`:
  - `itineraryPanelTab: 'ITINERARY' | 'EXPERIENCES'`
- Actions:
  - `setItineraryPanelTab`
  - optional `toggleItineraryPanelTab`

## 5.3 Removed/Deprecated UI Controls
- Deprecate `planningViewMode` usage for discovery toggling in this flow.
- Remove top-center `List View` toggle button.
- Remove bottom sheet as primary discovery UI for planning mode.
- Remove map popper surface from planning mode.

## 6) Component Changes

## 6.1 `src/components/features/globe-itinerary.tsx`
- Add tab header in itinerary panel.
- Render:
  - `Itinerary` tab: existing day timeline list.
  - `Experiences` tab: host/experience list surface.
- Inject day context selector into experiences tab.
- Remove list-view toggle control from top overlay.
- Remove `ExperienceDrawer` usage from this flow.
- Remove map popper rendering and map-popper action handlers.

## 6.2 `src/components/features/host-panel.tsx`
- Reuse as embedded experiences list content (panel mode).
- Keep callbacks:
  - focus experience
  - add/remove experience
  - view profile

## 6.3 `src/components/features/itinerary-day.tsx`
- Keep current no-inline-add button behavior.
- No additional functional changes required.

## 6.4 Optional New Component (recommended)
- `src/components/features/itinerary-panel-tabs.tsx`
  - isolates tabs + day context chip row + tab body rendering.

## 7) Data Source Contract (Critical)

Experiences tab must use the same planning host pipeline as map context:
- `hostsForPanel = nearbyHosts.length > 0 ? nearbyHosts : hostMarkers`

It must not rely on city-string static lookup as the primary source.

## 8) Acceptance Criteria (Binary)

- [ ] Itinerary panel renders `Itinerary` and `Experiences` tabs.
- [ ] Experiences tab supports explicit day selection and always shows selected day.
- [ ] Experience CTA text always reflects selected day (`Add to Day X`).
- [ ] Add/remove/booked behavior is correct for selected day.
- [ ] Switching tabs preserves selected day/host/experience context.
- [ ] List-view toggle and bottom-sheet discovery path are removed from planning mode.
- [ ] Map popper surface is removed from planning mode.
- [ ] Mobile uses full-width top tabs in drawer; small screens use day dropdown in `Experiences`.
- [ ] Typecheck, unit tests, and Playwright planning tests pass.

## 9) Test Requirements

## 9.1 Unit
- `src/store/ui-slice.test.ts`
  - tab default state
  - set/toggle tab actions

## 9.2 Playwright (`e2e/itinerary-editing.spec.ts`)
- verify tabs render in itinerary panel.
- verify day chip (desktop) or dropdown (small screens) changes add target day.
- verify add/remove/booked behavior in `Experiences` tab.
- verify tab-switch preserves selected experience/day.
- verify no list-view toggle present.
- verify no map popper is shown in planning mode.

## 10) Rollout Strategy

1. Implement tab shell + state.
2. Move host list rendering into `Experiences` tab.
3. Remove list toggle + bottom sheet entrypoints.
4. Add tests.
5. Validate desktop + mobile panel behavior.

## 11) Priority Recommendation

This should be prioritized **before** continuing later planning phases because it changes the core interaction contract for discovery/add flows.

Recommended sequence:
1. Implement this tabbed-panel spec now (Phase B follow-up / B.5).
2. Then continue with API normalization (Phase C), using this new interaction model as the stable client contract.
