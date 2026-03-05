# Specification: Experience Cross-Referencing & Location Matching

## 1. Overview
This feature enhances the itinerary generation process by intelligently cross-referencing AI-generated itinerary locations (Sights, Landmarks) with **real Host Experiences** stored in the database. 

Instead of generic host suggestions, the system will identify if a specific location in the user's plan is covered by a host's experience (e.g., "You are visiting the Rijksmuseum; Host Sarah offers a guided tour here").

## 2. Core Architecture

### 2.1 The Concept
We will introduce a **Geospatial Matching Layer** into the `ItineraryOrchestrator`.
*   **Input**: A set of geocoded locations (lat/lng) from a generated Itinerary Day.
*   **Process**: Query the `ExperienceStop` table for stops within a user-defined radius (e.g., 200m) of these locations.
*   **Output**: A list of `HostExperience` records, ranked by relevance (number of matching stops).
*   **UX**: Present these as "Upgrade" opportunities for specific itinerary items.

### 2.2 Data Model Targets
We will leverage the existing Prisma schema:
*   `HostExperience`: The parent record (Title, Host, Price).
*   `ExperienceStop`: The child records containing specific `lat`, `lng`, and `placeName` data.

> **Note**: This logic relies on `ExperienceStop` data being accurate. We may need to backfill/seed this data if current mock data lacks stops.

## 3. Implementation Logic

### 3.1 The `ExperienceMatcher` Service
A new service (or utility class) `src/lib/matching/experience-matcher.ts` will be created.

#### Algorithm:
1.  **Extract Locations**: Iterate through the day's `ItineraryItem`s. Collections `[Lat, Lng]` pairs.
2.  **Broad Search**: Fetch all `ExperienceStop` records within a "Bounding Box" of the city to minimize DB load.
3.  **Precise Match**: Use **Haversine Distance** to filter stops within `~200 meters` of any itinerary item.
4.  **Grouping**: Group matching stops by their `experienceId`.
    *   *Example*: If "Museum Stop" and "Lunch Stop" both match logic for Experience A, Experience A gets a higher score.
5.  **Ranking**:
    *   **Direct Hit**: +10 points (Stop location matches Itinerary location).
    *   **Proximity**: +5 points (Stop is nearby).
    *   **Category Match**: +3 points (Experience category matches User intent).

### 3.2 Integration Point
The logic will be hooked into `ItineraryOrchestrator.processDay`:

```typescript
// Current Flow
const resolvedActivities = await resolvePlaces(draftDay.activities);

// New Step
const matchingExperiences = await experienceMatcher.findMatches(resolvedActivities);

// Result Construction
return {
  ...dayData,
  activities: resolvedActivities,
  suggestedExperiences: matchingExperiences // New field
}
```

## 4. User Experience (UX) Flow

1.  **Orchestration**: User asks "Plan 3 days in Amsterdam".
2.  **Generation**: System identifies "Day 1: 10:00 AM - Visit Anne Frank House".
3.  **Matching**: Backend finds "Historical Canal Walk" (Experience ID: 123) has a stop at "Anne Frank House".
4.  **Presentation**:
    *   The Itinerary Item shows the standard "Anne Frank House" card.
    *   **UI Addition**: A "Sparkle" icon or "Local Host Available" badge appears on the card.
    *   **Interaction**: User clicks the badge -> Sees "Sarah's Historical Canal Walk covers this location! Book her to guide you."
    *   **Action**: "Replace generic item with this Experience".

## 5. Technical Requirements

### 5.1 Database
*   Ensure `ExperienceStop` table is populated with lat/lngs.
*   (Optional Future) Add PostGIS extension if performance becomes an issue with thousands of stops. For MVP, Haversine in JS/SQL is sufficient.

### 5.2 API
*   New server action or internal function: `findExperiencesForLocations(locations: GeoPoint[])`.

### 5.3 Types
```typescript
interface MatchedExperience {
  experience: HostExperience;
  matchedStops: {
    itineraryItemId: string; // The generic item ID
    experienceStopId: string; // The host's stop ID
    distanceMeters: number;
  }[];
  matchScore: number;
}
```

## 6. Phased Rollout plan

*   **Phase 1: The Service**: Implement `ExperienceMatcher` and unit test it against mock DB data.
*   **Phase 2: Seeding**: Create a script to populate `ExperienceStop`s for our test hosts (Amsterdam/Paris) to ensure we have matches to find.
*   **Phase 3: Integration**: Wire it into the `ItineraryOrchestrator` output.
*   **Phase 4: Frontend**: Update the `ItineraryItem` component to render the "Upgrade" suggestion.
