# Technical Spec: Itinerary Location Consolidation

**Status**: PROPOSED
**Author**: Antigravity Agent
**Date**: 2026-02-08
**Related Issue**: Multi-city itineraries create duplicate/redundant markers for consecutive days in the same city.

## 1. Problem Description
When generating a multi-city trip (e.g., "Rome, Florence, Venice"), the AI successfully creates an itinerary and resolves locations. However, if a city spans multiple days (e.g., Rome for Day 1 and Day 2), the "Globe" visualization currently creates **separate** destination markers for each day.

This occurs because the frontend (`plan-converter.ts`) tries to group days by comparing city names. Currently, it extracts city names from the `anchorLocation` string (e.g., "Rome, Italy" vs "Rome"), which is unreliable and leads to mismatches.

## 2. Root Cause Analysis
1.  **Data Gap**: The explicitly resolved `city` and `country` determined by the AI Orchestrator are **not** passed down to the final `ItineraryPlan` domain model. They exist in the `DraftItinerary` but are lost during processing.
2.  **Frontend Guesswork**: `plan-converter.ts` is forced to "guess" the city name from the `anchorLocation` object, which is brittle.

## 3. Proposed Solution
Build a robust chain of custody for location context from the AI prompt down to the visualization.

### 3.1. Domain Model Update (`src/lib/ai/types.ts`)
Update `DayPlanSchema` to include optional `city` and `country` fields. This makes the location context a first-class citizen in the data structure.

```typescript
export const DayPlanSchema = z.object({
  // ... existing fields
  city: z.string().optional().describe('Explicit city context for this day'),
  country: z.string().optional().describe('Explicit country context for this day'),
});
```

### 3.2. Orchestrator Update (`src/lib/ai/orchestrator.ts`)
In the `processDay` method, pass the resolved `dayCity` and `dayCountry` into the returned object.

```typescript
return {
  dayNumber: draftDay.dayNumber,
  title: draftDay.title,
  city: dayCity,       // <--- NEW
  country: dayCountry, // <--- NEW
  // ... other fields
};
```

### 3.3. Converter Update (`src/lib/ai/plan-converter.ts`)
Update `convertPlanToGlobeData` to prefer the explicit `day.city` field for consolidation logic.

**Logic:**
- **IF** `day.city` exists: Use it for comparison with `lastDestination.city`.
- **ELSE**: Fall back to existing `extractCityName` logic (for backward compatibility).

```typescript
// Consolidation Logic
const currentCity = day.city || extractCityName(day.anchorLocation);
// ... comparison logic
```

## 4. Verification Plan
1.  **Code Review**: Verify schemas and data flow.
2.  **E2E Test**:
    - Generate a multi-city trip (e.g., "3 days in Paris, 2 days in London").
    - **Expectation**:
        - Paris should have **one** consolidated marker containing activities for Days 1-3.
        - London should have **one** consolidated marker for Days 4-5.
        - Map should show exactly 2 main city markers (plus the start/end route).
