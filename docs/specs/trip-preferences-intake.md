# Trip Preferences Intake — Implementation Plan

Capture structured trip preferences conversationally before `generateItinerary` is invoked. Preferences are persisted to the DB so returning to an old trip never loses collected answers.

---

## Overview

The AI collects preferences through natural conversation. Each preference field has one of three states:

| State | Meaning |
|---|---|
| `null` | Not yet collected |
| `"waived"` | User opted out / doesn't care |
| `<value>` | Actual answer |

`generateItinerary` is gated: it can only be called when **no field is `null`**. The AI calls a new `updateTripPreferences` tool to record answers and waivers using the same call shape.

---

## Fields

### Required (cannot be waived — `generateItinerary` is blocked until answered)
- `partyType`: `"solo" | "couple" | "family_with_kids" | "family_with_elderly" | "group"`
- `partySize`: `number`

> `destinations` and `dates` are already gated by the existing `getPlannerQuestion` flow and are not part of this spec.

### Optional (can be waived — defaults are applied if `"waived"`)
- `accommodationStyle`: `"hotel_in_town" | "house_outside_town" | "campsite" | "hostel" | "mixed"`
- `pace`: `"relaxed" | "balanced" | "packed"`
- `budget`: `"budget" | "mid" | "premium"`
- `foodPreferences`: `string[]`

---

## Implementation Checklist

### Phase 1 — Type & schema definition

- [x] Create `src/types/trip-preferences.ts`
  - Define `TripPreferenceValue = string | number | string[] | "waived" | null`
  - Define `TripPreferences` interface with all fields typed as `TripPreferenceValue | null`
  - Export `REQUIRED_PREFERENCE_FIELDS` and `OPTIONAL_PREFERENCE_FIELDS` string arrays
  - Export `isTripPreferencesComplete(prefs: TripPreferences): boolean` — returns true when no field is `null`
  - Export `applyPreferenceDefaults(prefs: TripPreferences): ResolvedPreferences` — maps `"waived"` to sensible defaults for generation

- [x] No Prisma schema change needed — `Trip.preferences Json @default("{}")` already exists

---

### Phase 2 — Repository layer

- [x] Add `getTripPreferences(tripId: string, userId: string): Promise<TripPreferences>` to `src/lib/trips/repository.ts`
  - Reads `Trip.preferences` and parses/validates against `TripPreferences` shape
  - Returns a zero-valued (all `null`) object if the record is empty or malformed

- [x] Add `persistTripPreferences(userId, tripId, preferences): Promise<void>` to `src/lib/trips/repository.ts`
  - Writes the full preferences object to `Trip.preferences`

- [x] `GET /api/trips/[tripId]` already returns `preferences` — `findUnique` with `include` returns all scalar fields

---

### Phase 3 — Planner state hydration

- [x] Update `seedPlannerStateFromTrip` in `src/lib/agents/planner-state.ts`
  - Loads `Trip.preferences` in parallel with the trip seed; merges into `PlannerFlowState`
  - Also calls `syncPreferencesToLegacyState` to hydrate legacy fields from stored preferences

- [x] Extend `PlannerFlowState` in `src/lib/agents/planner-state.ts` with `tripPreferences: TripPreferences`

- [x] Update `DEFAULT_PLANNER_STATE` to include `tripPreferences: { ...DEFAULT_TRIP_PREFERENCES }`

- [x] Add `syncPreferencesToLegacyState` helper — one-way sync from `TripPreferences` into legacy `PlannerFlowState` fields

---

### Phase 4 — `updateTripPreferences` tool

- [x] Add the tool definition to `src/lib/agents/planning-agent.ts`
  ```ts
  updateTripPreferences: tool({
    description: 'Record a single trip preference answer or waiver. Call this whenever the user provides or waives a preference. Use value "waived" when the user opts out.',
    parameters: z.object({
      field: z.enum(['partyType', 'partySize', 'accommodationStyle', 'pace', 'budget', 'foodPreferences']),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
    }),
    execute: async ({ field, value }) => { ... }
  })
  ```
  - Calls `updateTripPreference(context.tripId, ...)` from the repository
  - Updates `state.tripPreferences` in the current flow state
  - Returns `{ updated: true, preferences: <full updated object>, complete: boolean }`

---

### Phase 5 — Gate `generateItinerary`

- [x] At the top of the `generateItinerary` tool's `execute` function in `planning-agent.ts`:
  - Calls `getMissingRequiredFields(nextState.tripPreferences)` — returns blocked response with field list if any are null
  - Gate is in the tool execute so the AI receives clear feedback about what is still missing

---

### Phase 6 — System prompt update

- [x] Updated `SYSTEM_PROMPT` in `src/lib/agents/planner-prompts.ts` with intake flow instructions
- [x] Preferences status injected into planner directive each turn via `formatPreferencesForDirective()` — includes per-field status and gate status line
- [x] `generateItinerary` tool recommendation in directive is updated to show BLOCKED when required fields are missing

---

### Phase 7 — Wire preferences into generation

- [x] No changes to `planner-generate.ts` needed — `syncPreferencesToLegacyState` pushes `TripPreferences` values into the existing `PlannerFlowState` fields before generation, so the existing `resolveGenerateItineraryRequest` and `buildPlannerGenerationSnapshot` receive them automatically

---

### Phase 8 — Tests

- [ ] Unit tests for `isTripPreferencesComplete` — all fields null, some null, all answered, mix of answered + waived
- [ ] Unit tests for `applyPreferenceDefaults` — verify `"waived"` maps to correct defaults
- [ ] Unit test for `updateTripPreference` repository function (mock Prisma)
- [ ] Update existing `planner-generate.test.ts` to cover the new `tripPreferences` parameter path

---

## Files changed

| File | Change |
|---|---|
| `src/types/trip-preferences.ts` | New — type definitions and helpers |
| `src/lib/trips/repository.ts` | Add `getTripPreferences`, `updateTripPreference` |
| `src/app/api/trips/[tripId]/route.ts` | Include `preferences` in GET response |
| `src/lib/agents/planner-state.ts` | Extend `PlannerFlowState`, update `seedPlannerStateFromTrip` |
| `src/lib/agents/planning-agent.ts` | Add `updateTripPreferences` tool, gate `generateItinerary` |
| `src/lib/agents/planner-prompts.ts` | Update `SYSTEM_PROMPT`, add preferences injection |
| `src/lib/agents/planner-generate.ts` | Accept + resolve `TripPreferences` in generation |
| `src/lib/agents/planner-generation.ts` | Pass preferences through to snapshot builder |

---

## Open questions

- Should `partySize` be collected in the same question as `partyType` or separately? (Likely same turn: "Who are you travelling with, and how many of you?")
- Should `foodPreferences` be a structured enum or free-text string array? (Currently free-text in the schema)
- When a trip already has a generated itinerary and the user updates a preference, should it trigger a re-generation prompt or just update the stored value silently?
