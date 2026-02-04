# UX & Technical Specification: Planning Mode Architecture

**Status**: APPROVED / LOCKED
**Role**: Lead Product + UX Architect
**Context**: Planning Mode Interaction Model

---

## 1. Core Product Model

The Planning Mode is a **Map-First** experience designed to help users build itineraries through spatial discovery.

### **The Two Views**
1.  **Map View (Primary/Default)**: 
    *   3D Globe / Map interface.
    *   Markers represent **Hosts**.
    *   Goal: Visual exploration and context.
2.  **List View (Secondary)**: 
    *   Bottom Sheet overlay.
    *   Scrollable list of Experiences/Hosts.
    *   Goal: Efficient browsing and filtering.

**Invariant**: Only **one** view is primary at a time, but they share **identical state**. Switching views preserves context (selection, focus, active day).

---

## 2. Interaction Flows

### Flow A: Map Discovery (The "Happy Path")
1.  **Default State**: User sees the Map. Itinerary skeleton is present but sparse. Host markers (Houses/Avatars) are visible.
2.  **Select Host**: User clicks a **Host Marker**.
    *   *Action*: Shows **Map Popper** (summary card) above the marker.
    *   *Content*: Host summary + List of their experiences.
3.  **Focus Experience**: User clicks an **Experience** inside the Popper.
    *   *Action*: 
        *   Map refocuses to center on the experience location.
        *   Popper might expand or change state to show specific experience details.
        *   **Contextual CTA** appears: "Add to Day [X]".
4.  **Commit**: User clicks "Add to Day [X]".
    *   *Action*: Experience is added to the Itinerary.
    *   *Feedback*: Success toast. Map state remains active (doesn't reset).

### Flow B: List Discovery
1.  **Toggle List**: User clicks "List View" toggle (Top Control).
2.  **Browse**: Bottom Sheet slides up. Map is dimmed/de-emphasized but visible. Filters are available here.
3.  **Focus Experience**: User clicks an **Experience** in the list.
    *   *Action*: 
        *   **List View collapses** (or minimizes).
        *   **Map Refocuses** on the selected experience (identical to Flow A Step 3).
        *   The UI enters the "Focused Experience" state on the Map.
4.  **Commit**: User clicks "Add to Day [X]" on the map interface.

### 2.1 Interaction Refinements (Locked)
*   **Mobile Layout**: The Itinerary Sidebar becomes a **Right-Side Drawer** on mobile devices.
*   **Filters**: Filters live **exclusively** in the `ExperienceListSheet`. None on the map.
*   **Auto-Expand**: When adding an item, the Itinerary Sidebar **automatically expands** to visualize the addition/animation.
*   **State Conflict**: Opening the `ExperienceListSheet` **closes** any active Map Popper.
*   **Z-Index**: AI Chat Overlay > ExperienceListSheet > Itinerary Sidebar > Map.

---

## 3. State Management (Shared Context)

The application must maintain a single source of truth for the Planning Session.

**Store**: `PlanningSlice` (Redux/Zustand)

```typescript
interface PlanningState {
  viewMode: 'MAP' | 'LIST';
  
  // Selection Context
  activeItineraryDay: string; // The day currently implied for "Add to..."
  selectedHostId: string | null;
  selectedExperienceId: string | null;
  
  // Map State
  mapFocus: { lat: number; lng: number; zoom: number } | null;
  
  // Data
  visibleHosts: Host[]; // Filtered set
  activeFilters: FilterCriteria;
}
```

**Critical Rules**:
*   **Filters** apply to `visibleHosts`. This dataset drives BOTH the Map Markers and the List View items.
*   **Selection** (`selectedExperienceId`) is view-agnostic. Selecting directly on the map or via the list updates this ID.
*   **View Switching**: Toggling `viewMode` DOES NOT clear `selectedExperienceId`.

---

## 4. Technical Discovery & Implementation Details

### 4.1 Marker Density & Clustering
*   **Strategy**: Use **Grid-based Clustering** or **Supercluster** logic (Cesium compatible).
*   **Behavior**:
    *   Zoom Level < 10: Show City Clusters (e.g., "Paris (50)").
    *   Zoom Level > 10: Show Individual Host Markers.
*   **Performance**: Markers must be lightweight entities. Do not render full React components for every marker if using WebGL. Use Billboards/Points.

### 4.2 Large Data Sets
*   **Pagination/Windowing**: The List View must use **Virtualization** (e.g., `react-window`) if > 50 items.
*   **Map**: Only render markers in the current viewport (plus padding).

### 4.3 Desktop vs. Mobile Bottom Sheet
*   **Mobile**: Standard Bottom Sheet (slides up 50% -> 90%).
    *   *Interaction*: Drag handle to resize. Backdrop tap to dismiss.
*   **Desktop**: 
    *   **Variant A**: Side Panel (Drawer) pushing the map.
    *   **Variant B (Requested)**: "Bottom Sheet" style overlay at the bottom-center of the screen, width-constrained (e.g., max-width 600px).
    *   *Decision*: Use **Variant B** to strictly maintain the "Bottom Sheet" mental model requested, but ensure it doesn't obscure the Itinerary Panel (usually on the left).

### 4.4 Edge Cases
*   **Switching Views with Selection**:
    *   *Scenario*: User selects Experience A in List, then toggles Map View.
    *   *Result*: Map is already focused on A. Popper is open for A.
*   **Changing Active Day**:
    *   *Scenario*: User has Experience selected ("Add to Day 1"), then clicks Day 2 in Itinerary.
    *   *Result*: CTA updates to "Add to Day 2". Selection persists.
*   **Dismissal**:
    *   Clicking "Empty Space" on Map -> Clears Selection.
    *   Clicking "Back" in List -> Clears Selection.

---

## 5. Failure Modes to Prevent

1.  **"Where am I?"**: Switching to List View covering the entire map context.
    *   *Fix*: List View should start at 50% height, keeping map context visible.
2.  **Duplicate Logic**: Having separate "Add" handlers for Map Popper vs. List Item.
    *   *Fix*: Use a single `onAddExperience(experienceId, dayId)` handler.
3.  **Filter Confusion**: Filters applied in List View making markers disappear "mysteriously" on the Map.
    *   *Fix*: When filters are active, show a subtle "Filters Active" indicator on the Map View too.

---

## 6. Component Responsibilities

| Component | Responsibility | Shared State Access |
| :--- | :--- | :--- |
| `PlanningContainer` | Layout, View Toggling, Global State Provider | Owner |
| `ViewToggle` | Switch between MAP and LIST | `viewMode` |
| `Google/CesiumMap` | Rendering Markers, Handling Clicks, Camera Control | `visibleHosts`, `selectedHost` |
| `MapPopper` | Displaying Host details on map | `selectedHost` |
| `ExperienceListSheet` | Browsing list (The "List View") | `visibleHosts`, `viewMode` |
| `ItineraryTimeline` | Displaying skeleton, Selecting Active Day | `activeItineraryDay` |

---

## 7. Acceptance Criteria

1.  **Default Load**: App loads in **Map View**. No list sheet is open. Icons appear on map.
2.  **Parity**: Clicking an experience in the List View performs the **exact same** camera focus and selection animation as clicking it on the Map.
3.  **Persistence**:
    *   Select Experience A.
    *   Switch View.
    *   Experience A is still selected.
4.  **Stability**: The Itinerary Timeline is always visible/accessible, regardless of View Mode.
5.  **Clean Exit**: Clicking the Map background closes any active Popper and clears selection.

---

## 8. Non-Goals

*   **Marketplace Browsing**: This is not generic browsing. It is **Intent-Based Planning** for a specific Trip.
*   **Edit Itinerary Mode**: We are not building the drag-and-drop reordering tools in this spec (covered separately). Focusing purely on **Discovery & Adding**.
*   **Full Profile Pages**: The Map Popper / List Item is a summary. Full profiles are a deep dive (out of scope for quick planning).

---

## 9. Implementation Delta & Migration

This section defines the specific changes required to move from the current `globe-itinerary.tsx` implementation to this new architecture.

| Feature | Current Implementation | New Architecture |
| :--- | :--- | :--- |
| **Main Layout** | Flex row with `Globe` + `HostPanel` (Right Sidebar). | Layered: `Globe` (Full) + `ItinerarySidebar` (Left, Collapsible) + `ExperienceListSheet` (Bottom, Toggleable). |
| **List View** | `HostPanel` is the list. | `HostPanel` concept **migrates** to become the `ExperienceListSheet` (Bottom Sheet). |
| **Itinerary** | Bottom timeline bar (or Mixed). | Explicit **Left Sidebar** (Tree Structure). Bottom Timeline **removed**. |
| **Host Details** | Shown in `HostPanel` sidebar on click. | Shown in `MapPopper` (Floating Card) on click. |
| **State** | Distributed. | Consolidated `PlanningSlice`. |

### 9.1 Breaking Changes
1.  **Refactor `HostPanel`**: It evolves into the `ExperienceListSheet`. It is no longer a persistent sidebar but a toggleable bottom sheet for browsing.
2.  **Itinerary Layout**: The Itinerary moves to a **Collapsible Left Sidebar** displaying a hierarchical tree (Anchor -> Day -> Item). The bottom timeline bar is deleted.
3.  **Globe Layout**: Globe occupies the full background. The Sidebar floats or pushes content; the Bottom Sheet overlays.
