# Architecture Specification: Planning Mode & Multi-Stop Anchors

**Status**: APPROVED / LOCKED
**Role**: Lead Product + UX Architect

---

## 1. Executive Summary
The Planning Mode is a **Map-First** experience designed to help users build complex, multi-stop itineraries through spatial discovery. Beyond simple city-hopping, the system supports **Road Trips**, **Hiking Expeditions**, and **Regional Explorations**.

To achieve this, the system uses flexible **Trip Anchors**. An Anchor represents a block of time in the itinerary but can be defined by a single city, a region, or a sequence of locations (e.g., a driving route).

---

## 2. Terminology & Concepts
*   **Trip**: Top-level container (e.g., "Pacific Coast Highway Road Trip").
*   **TripAnchor** (formerly TripStop): A distinct segment of the trip.
    *   *Examples*: "San Francisco" (City), "Yosemite & Sierras" (Region), "Drive to LA via Big Sur" (Route).
*   **ItineraryDay**: A specific calendar day within an Anchor.
*   **ItineraryItem**: An actionable unit (Sight, Experience, Meal) within a Day.

## 2.1 Design Invariants (Non-Negotiable)
- A **TripAnchor** represents a semantic block of a journey, not necessarily a single geographic point.
- `TripAnchor.locations` is an **ordered list** that represents the canonical spatial narrative of that Anchor.
- Dates are optional inputs and must be treated as **constraints**, not required fields.
- Booking and availability logic must remain **downstream** of planning logic.
- Only **one** view is primary at a time (Map vs List), but they share **identical state**. Switching views preserves context (selection, focus, active day).

---

## 3. The Two Views (Interaction Model)

### 1. Map View (Primary/Default)
*   3D Globe / Map interface.
*   Markers represent **Hosts** and **Anchors**.
*   **Flow**: Click Host Marker -> Shows Map Popper (Host Summary) -> Click Experience -> Contextual CTA Add to Day [X] -> Added.

### 2. List View (Secondary)
*   Bottom Sheet overlay (slides up).
*   Scrollable list of Experiences/Hosts where filters live.
*   **Flow**: Click List View Toggle -> Click Experience in List -> List collapses & Map Refocuses on Experience -> Shows Map Popper.

### Layout & Responsibilities
| Component | Responsibility | Shared State Access |
| :--- | :--- | :--- |
| `PlanningContainer` | Layout, View Toggling, Global State Provider | Owner |
| `Google/CesiumMap` | Rendering Markers, Handling Clicks, Camera Control | `visibleHosts`, `selectedHost` |
| `ExperienceListSheet` | Browsing list (The "List View") | `visibleHosts`, `viewMode` |
| `ItineraryTimeline` | Displaying skeleton (Left Sidebar Tree View) | `activeItineraryDay` |

---

## 4. Multi-Stop Architecture (Prisma Data Model)

We use `TripAnchor` with a `locations` JSON array to support multiple stops per segment.

```prisma
model TripAnchor { 
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  
  // Flexible Location Definition
  title     String   // e.g., "Tuscany", "Stop 1: Amsterdam", "Hike Phase 1"
  type      AnchorType @default(CITY) // CITY, REGION, ROAD_TRIP, TRAIL
  
  // Array of { name: string, lat: number, lng: number, placeId?: string }[]
  // For a City: contains 1 item. For a Road Trip: contains multiple stops in order.
  locations Json     
  primaryLocationIndex Int? 
  
  order     Int
  days      ItineraryDay[]
  
  // ... timestamps, etc
}
```

### 4.1 Usage Scenarios

**Scenario A: The Classic City Hop (Amsterdam 3 days -> Berlin 2 days)**
Uses **Two Separate Anchors**.
*   **Anchor 1**: Title="Amsterdam", Type=CITY, Days=[1, 2, 3].
*   **Anchor 2**: Title="Berlin", Type=CITY, Days=[1, 2].

**Scenario B: The Road Trip (Highlands Route 500)**
Uses **One Single Anchor** with multiple locations.
*   **Anchor 1**: Title="Highlands Road Trip", Type=ROAD_TRIP, Days=[1, 2, 3, 4, 5].
*   **Locations**: `[Inverness, Applecross, Ullapool, ...]`.
*   *Result*: A single continuous timeline. Visual map shows full route.

---

## 5. State Management & API Design

### 5.1 State Context
The application maintains a single source of truth (`PlanningSlice` via Redux/Zustand):
- `viewMode`: 'MAP' | 'LIST'
- `activeItineraryDay`: The day currently implied for "Add to..."
- `selectedExperienceId`: Selected ID (syncs between Map/List clicks).
- `visibleHosts`: Filtered dataset driving BOTH Map Markers and List View.

### 5.2 Drag and Drop Reordering API
The system uses `@dnd-kit/core` on the frontend and a transactional backend API:
- `POST /api/itinerary/reorder`
- **Payload**: `items: { id: string, dayId: string, orderIndex: number }[]`
- **Behavior**: Enables dragging an item from *Amsterdam Day 2* to *Berlin Day 1* (changing `dayId` and `orderIndex`). Reordering must support moving items between Anchors types.

### 5.3 Marker Density
- Zoom Level < 10: Show City Clusters (e.g., "Paris (50)").
- Zoom Level > 10: Show Individual Host Markers.
- Use Billboards/Points for WebGL performance.

---

## 6. Failure Modes to Prevent

1.  **"Where am I?"**: List View shouldn't cover the entire map context on desktop (max width constraint or 50% height).
2.  **Duplicate Logic**: Use a single `onAddExperience(experienceId, dayId)` handler for Map Popper vs. List Item.
3.  **Filter Confusion**: When filters are active in List View, show a subtle "Filters Active" indicator on the Map View to explain why markers disappear.
4.  **Zero-Host Trips**: AI should not generate a skeleton devoid of hosts without explicit user request.
