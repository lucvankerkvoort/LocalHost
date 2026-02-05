# Technical Specification: Flexible Multi-Stop Planning (Trip Anchors)

**Status**: DRAFT
**Context**: Replaces rigid "Trips Stops" with flexible "Trip Anchors".

---

## 1. Database Schema Changes (Prisma)

### 1.1 New Enum: `AnchorType`
Defines the semantic role of an anchor.

```prisma
enum AnchorType {
  CITY
  REGION
  ROAD_TRIP
  TRAIL
}
```

### 1.2 Model Migration: `TripStop` -> `TripAnchor`
We will **rename and refactor** the existing `TripStop` model.
*   **Rename**: `TripStop` -> `TripAnchor`
*   **Remove**: `city`, `country`, `lat`, `lng` columns.
*   **Add**:
    *   `title` (String): Display name (e.g., "Pacific Coast Highway").
    *   `locations` (Json): Ordered array of location objects.
    *   `primaryLocationIndex` (Int?): Index of the main "focus" location.
    *   `type` (AnchorType).

**Revised Model**:
```prisma
model TripAnchor {
  id        String   @id @default(cuid())
  tripId    String
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  
  title     String
  type      AnchorType @default(CITY)
  
  // JSON Structure: [{ name, lat, lng, placeId?, role? }]
  locations Json     
  primaryLocationIndex Int?
  
  order     Int
  days      ItineraryDay[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tripId, order])
}
```

### 1.3 Update `ItineraryDay`
To support day-specific locations within a multi-stop anchor (e.g., stops along a road trip).

*   **Add**: `locationOverride` (Json?)
    *   Structure: `{ placeId?, lat, lng, label }`

---

## 2. API Layer Changes

### 2.1 Server Actions (`src/actions/trips.ts`)
*   `createTripAnchor(tripId, data)`:
    *   Allows passing `locations` array.
    *   Auto-generates `ItineraryDays` based on duration.
*   `updateTripAnchor(anchorId, data)`:
    *   Update title, type, or locations.
*   `reorderAnchors(tripId, orderedIds)`:
    *   Updates `order` field for all anchors in a transaction.

### 2.2 Reorder Endpoint
*   **New Action**: `reorderItineraryItems(items: { id: string, dayId: string, order: number }[])`
    *   Existing move logic relies on single-day updates.
    *   This logic must become **transactional** and support moving items across DIFFERENT dayIds (which belong to DIFFERENT anchors).

---

## 3. Frontend Architecture

### 3.1 State Management (`globe-slice.ts`)
We need to decouple "Itinerary State" from "Visual Globe State".

**New Slice**: `itinerary-slice.ts` (or refactor `globe-slice`)
*   `activeAnchorId`: string | null (Which anchor is currently expanded/focused?)
*   `activeDayId`: string | null
*   `itineraryTree`: Normalized structure of Anchors -> Days -> Items.

**Visual State (`globe-slice.ts`) Updates**:
*   `visualTarget`: Must support viewing a **Bounding Box** (for Region/Road Trip) not just a point.
*   `routeMarkers`: Will now include lines/polylines derived from `TripAnchor.locations` (where `type === ROAD_TRIP`).

### 3.2 UI Refactor: Itinerary Tree (Sidebar)
*   **Component**: `ItinerarySidebar`
*   **Structure**:
    *   `<TreeRoot>`
        *   `<AnchorNode>` (Collapsible)
            *   `<DayNode>` (Collapsible)
                *   `<ItemNode>` (Draggable)
*   **Interaction**:
    *   Clicking `<AnchorNode>` -> Dispatches `setActiveAnchorId` + `setVisualTarget(anchor.bounds)`.

### 3.3 Map Visualization
*   **Globe Component**:
    *   If `activeAnchor.type === ROAD_TRIP`: Render a **Polyline** connecting `activeAnchor.locations`.
    *   If `activeAnchor.type === CITY`: Render a **Cluster/Pin**.

---

## 4. Implementation Stages

### Stage 1: Database & Model
1.  Run Prisma Migration (`TripStop` -> `TripAnchor`).
2.  Update seed scripts/factories.
3.  Update types in `src/types/globe.ts` and `src/types/itinerary.ts`.

### Stage 2: State & Actions
1.  Implement `activeAnchorId` in Redux.
2.  Update `fetchActiveTrip` to return the new Anchor structure.
3.  Implement `reorderItineraryItems` server action.

### Stage 3: UI - The Tree
1.  Build `ItinerarySidebar`.
2.  Port existing `ItineraryDayColumn` logic into the new `DayNode` component.
3.  Remove Bottom Timeline component.

### Stage 4: Map & Polish
1.  Wire up "Anchor Click" -> "Map FlyTo".
2.  Implement Polyline rendering for Road Trips.
