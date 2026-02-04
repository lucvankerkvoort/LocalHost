# Architecture Specification: Flexible Multi-Stop Planning (Anchors)

## 1. Executive Summary
The goal is to upgrade the planning system to support complex, multi-stop itineraries. Beyond simple city-hopping, the system must support **Road Trips**, **Hiking Expeditions**, and **Regional Explorations**. 
To achieve this, we will transition from rigid "City Stops" to flexible **Trip Anchors**. An Anchor represents a block of time in the itinerary but can be defined by a single city, a region, or a sequence of locations (e.g., a driving route).

## 2. Terminology & Concepts
*   **Trip**: Top-level container (e.g., "Pacific Coast Highway Road Trip").
*   **TripAnchor** (formerly TripStop): A distinct segment of the trip.
    *   *Examples*: "San Francisco" (City), "Yosemite & Sierras" (Region), "Drive to LA via Big Sur" (Route).
*   **ItineraryDay**: A specific calendar day within an Anchor.
*   **ItineraryItem**: An actionable unit (Sight, Experience, Meal) within a Day.

## 2.1 Design Invariants (Non-Negotiable)
- A **TripAnchor** represents a semantic block of a journey, not necessarily a single geographic point.
- `TripAnchor.locations` is an **ordered list** that represents the canonical spatial narrative of that Anchor.
- The system must never assume that a TripAnchor has a single “correct” location.
- Dates are optional inputs and must be treated as **constraints**, not required fields.
- Booking and availability logic must remain **downstream** of planning logic.
- AnchorType is a **UI and AI hint**, not a strict validator.

## 3. Data Model Architecture (Prisma)

### 3.1 From `TripStop` to `TripAnchor`
We will evolve `TripStop` into `TripAnchor` to support multiple locations per segment.

**Proposed Model Change**:
The `locations` field serves a dual role:
1.  **Spatial Definition**: Where this anchor exists (for map clustering and search).
2.  **Narrative Sequence**: How the anchor progresses (for road trips or multi-city hops within one anchor).

```prisma
model TripAnchor { // Replaces TripStop
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  
  // Flexible Location Definition
  title     String   // e.g., "Tuscany", "Stop 1: Amsterdam", "Hike Phase 1"
  type      AnchorType @default(CITY) // CITY, REGION, ROAD_TRIP, TRAIL
  
  // Instead of single city/lat/lng strings:
  locations Json     // Array of { name: string, lat: number, lng: number, placeId?: string }[]
                     // For a City: contains 1 item.
                     // For a Road Trip: contains multiple stops in order.
  primaryLocationIndex Int? // Optional index indicating the representative or “center” location
  
  order     Int
  days      ItineraryDay[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tripId, order])
}

enum AnchorType {
  CITY
  REGION      // e.g. "Napa Valley" - center point is vaguely defined
  ROAD_TRIP   // Moving from A to B to C
  TRAIL       // Hiking route
}
```

### 3.3 Standard vs. Complex Flows
To clarify how multiple stops/cities are structured:

**Scenario A: The Classic City Hop (Amsterdam 3 days -> Berlin 2 days)**
This uses **Two Separate Anchors**.
*   **Anchor 1**: Title="Amsterdam", Type=CITY, Days=[1, 2, 3].
*   **Anchor 2**: Title="Berlin", Type=CITY, Days=[1, 2].
*   *Result*: Distinct sections in the UI. User finishes Amsterdam, then sees Berlin header.

**Scenario B: The Road Trip (Highlands Route 500)**
This uses **One Single Anchor** with multiple locations.
*   **Anchor 1**: Title="Highlands Road Trip", Type=ROAD_TRIP, Days=[1, 2, 3, 4, 5].
*   **Locations**: `[Inverness, Applecross, Ullapool, ...]`.
*   *Result*: A single continuous timeline. The visual map shows the full route. Individual Days can be tagged with specific sub-locations (e.g., Day 1: Inverness, Day 3: Ullapool) via the `ItineraryDay.locationOverride` field.

**Summary**: You can mix and match. A trip can be:
`[Anchor: London (3 Days)]` -> `[Anchor: Road Trip to Scotland (2 Days)]` -> `[Anchor: Edinburgh (3 Days)]`.

## 4. API Design (Server Actions & Routes)

### 4.1 Trip Management (CRUD)
*   `POST /api/trips`: Create new trip.
*   `GET /api/trips/:id`: Get full hierarchy (Anchors -> days -> items).

### 4.2 Anchor Management
*   `POST /api/trips/:id/anchors`: Add a new Anchor (`{ locations: [...], type: 'CITY' }`).
*   `PUT /api/trips/:id/anchors/:anchorId`: Update locations (e.g., adding a stop to a road trip).
*   `PUT /api/trips/:id/anchors/order`: Reorder anchors.

### 4.3 Item CRUD & Reordering
*   `POST /api/itinerary/items`: Create item.
*   `PATCH /api/itinerary/items/:id`: Update details (time, notes).
*   `DELETE /api/itinerary/items/:id`: Remove.
*   **`POST /api/itinerary/reorder`**: The heavy lifter.
    *   **Payload**: `items: { id: string, dayId: string, orderIndex: number }[]`
    *   **Behavior**: Transactional update. This enables dragging an item from *Amsterdam Day 2* to *Berlin Day 1* (changing `dayId` and `orderIndex`).
*   **Reordering**: Must support moving items between Anchors types.
    *   Validating that a "Hike" item makes sense in a "City" anchor is logical, but we won't strictly enforce it at the DB level to allow flexibility.

## 5. Frontend Architecture

### 5.1 State Management (Redux/Zustand)
The current `globe-slice` is likely heavy. We should separate **ItineraryEditableState**.
*   **Features**:
    *   `optimisticUpdates`: UI updates immediately on drag-drop; reverts on failure.
    *   `flattenedItems`: Maybe store items normalized by ID for easier generic lookups.

### 5.1 Visualization Changes
*   **The Globe/Map**:
    *   *City Anchor*: Shows a cluster/pin in the city.
    *   *Region Anchor*: Shows a bounded area or zoom level covering the region.
    *   *Road Trip/Trail*: Renders a **Polyline** connecting the `locations` array on the globe.

### 5.2 Helper Library: `dnd-kit`
Ideally use `@dnd-kit/core` and `@dnd-kit/sortable` for the drag-and-drop.
*   **SortableContext**: Each Day Column is a sortable context.
*   **DragOverlay**: Shows the item being dragged (semi-transparent).
*   **Cross-Container Dragging**: `dnd-kit` handles this naturally (moving from Container A to Container B).

### 5.2 Multi-Anchor UI
*   **Anchor Headers**: Instead of just "Amsterdam", the header might show "California Coast (3 stops)".
*   **Location Management**:
    *   Users need a UI to "Edit Anchor" -> Add/Remove locations from the array.

### 5.3 Multi-Stop UI Layout
*   **Horizontal Scroll vs. Accordion**:
    *   *Option A*: Horizontal list of Stops. Each Stop expands to show Days.
    *   *Option B* (Selected): **Itinerary Panel Tree View**.
        *   **Structure**: Hierarchical Tree in the Left Sidebar.
            *   `Anchor Node` (e.g., "Amsterdam") - Collapsible
                *   `Day Node` (e.g., "Day 1") - Collapsible
                    *   `Item Node` (e.g., "Van Gogh Museum") - Draggable
        *   **Behavior**:
            *   Clicking an Anchor Node focuses the map on that region.
            *   Clicking a Day Node focuses on that day's items.
            *   Items can be dragged between Days and even between Anchors.
        *   **Removal**: The "Bottom Day Cards" timeline is **removed entirely**. All navigation happens via the Tree.

## 6. Implementation Stages

### Stage 1: Core CRUD & Data Fixes
1.  Implement `TripStop` creation flow from UI (currently often hardcoded or single-city).
2.  Ensure `ItineraryDay` generation works when adding a STOP.
3.  Implement basic Item Add/Edit/Delete dialogs.

### Stage 1: Database Migration
1.  Rename/Migrate `TripStop` location fields to a `locations` JSON array.
2.  Add `AnchorType` enum.

### Stage 2: The "Reorder" API
1.  Build the generic `reorderItems` server action.
2.  Validate it accepts cross-day moves.

### Stage 2: UI Updates
1.  Update `TripHeader` to display generic titles rather than just City/Country.
2.  Update `GlobeItinerary` to render lines for Multi-Location Anchors.

### Stage 3: Visual Drag & Drop
1.  Install `dnd-kit`.
2.  Wrap `ItineraryDayColumn` items in Sortables.
3.  Implement `onDragEnd` handler to calculate new positions and call API.

### Stage 3: Planning Logic
1.  Ensure "Add Anchor" flow forces user to select Type (City vs Generic/Route).

3.  Implement `onDragEnd` handler to calculate new positions and call API.

### Stage 4: Multi-Stop UX
1.  Add "Add Destination" button to the header.
2.  Implement the logic to shift dates if a previous stop's duration changes.
