# Implementation Spec — Globe Itinerary Panel (List ↔ Globe Sync)

Date: 2026-02-01
Scope: Left-hand itinerary panel in globe view + bidirectional map sync

## Objective
Implement a left-hand itinerary panel that is tightly synchronized with globe markers. The list is the canonical order and acts as a timeline, navigation controller, and state mirror for the globe.

---

## High‑Level Behavior
- The **list order is the source of truth** for marker sequencing.
- Scrolling the list should feel like “scrubbing the journey.”
- Selection is bidirectional: list → map and map → list.
- **No route rendering on the globe.**

---

## Panel Visibility (Updated)
- **Show the panel only when itinerary days exist.**
  - Use globe state as the source of truth: `state.globe.destinations.length > 0`.
- Do **not** show the panel while an itinerary is generating (no skeleton state).
- If the itinerary is cleared, the panel disappears immediately.

---

## Panel Collapsing (New)
- Panel is **collapsible**.
- Collapsed state:
  - Panel reduces to a slim rail (icon-only).
  - No list content rendered.
  - Toggle control remains visible.
- Expanded state:
  - Full list and header visible.
- Collapse state is UI-only (no persistence required).

---

## Panel Structure

### 1) Sticky Day Header
- Displays: DAY label, date (or fallback “Unscheduled”), item count.
- Sticky while scrolling.
- Context only (no interaction).

### 2) Timeline‑Style List
- Vertical list with subtle timeline line.
- Each item shows: title, short description, optional metadata (duration/category).
- Each item corresponds 1:1 with a globe marker.

### 3) Add Item Action
- Fixed at bottom of panel.
- Visually separated from list.
- Does not interfere with scrolling.

---

## Synchronization Rules

### Source of Truth
- List order defines `positionIndex` and marker order.
- Each item must have: `itemId`, `positionIndex`, `markerId`.

### List → Map
- **Hover list item**: highlight marker (glow/pulse/scale). No camera move.
- **Click list item**: set ACTIVE, fly camera to marker.
- **Scroll list**: most‑visible item becomes FOCUSED; its marker is highlighted.
- Only one ACTIVE item at a time.

### Map → List
- **Click marker**: scroll list to item + set ACTIVE.
- **Marker hover**: highlight corresponding list card (no scroll).

---

## Visual States (Priority)
List and marker states are mirrored:
1) Active
2) Focused
3) Hovered
4) Default

Active > Focused > Hovered > Default

---

## Edge Cases
- Missing coordinates: list renders, marker hidden/disabled.
- Missing date: display “Unscheduled” (never “Invalid Date”).
- Reordering: updates marker order immediately.

---

## Architecture / State Management
- Maintain list state and globe state separately but synchronized via `itemId`.
- Avoid using array index as identity.
- Camera state is owned by globe/controller, not list components.

---

## Visual / Motion Notes (Updated)
- Panel uses **glass‑opaque** styling with **~20% opacity**.
  - Example: `background: rgba(12, 16, 24, 0.2);`
  - `backdrop-filter: blur(6px)` (reduced blur) and subtle border.
- Motion is smooth, eased, never bouncy.
- Globe remains visually dominant.

---

## Implementation Tasks (Targeted)

1) **Itinerary Panel UI**
- Add sticky header + timeline list layout.
- Add fixed bottom “Add Item” action.
- Render panel only when `state.globe.destinations.length > 0`.
- Apply glass‑opaque styling (~20% opacity) and **reduced blur**.
- Add collapse/expand toggle with slim rail state.

2) **List Interaction**
- Hover → marker highlight.
- Click → set ACTIVE + fly camera.
- Scroll → compute most‑visible item and set FOCUSED.

3) **Marker Interaction**
- Marker hover → highlight list item.
- Marker click → scroll to list item + set ACTIVE.

4) **Remove Route Rendering**
- Remove any globe route drawing logic and state dependencies.

---

## Target Files (Expected)
- `src/components/features/globe-itinerary.tsx` (panel container + sync logic)
- `src/components/features/itinerary-day.tsx` (list rendering)
- `src/components/features/cesium-globe.tsx` (marker rendering; remove route rendering)
- `src/store/globe-slice.ts` (state for active/hover/focus)

---

## Acceptance Criteria
1) List order controls marker order.
2) Hover/click/scroll in list updates marker states correctly.
3) Marker hover/click updates list state correctly.
4) Only one ACTIVE item at a time.
5) Missing coords or date do not break UI.
6) Panel only appears when itinerary days exist.
7) No route line is rendered on the globe.
8) Panel surface is visibly glass‑opaque (~20% opacity) with reduced blur.
9) Panel can be collapsed to a slim rail and expanded again.
