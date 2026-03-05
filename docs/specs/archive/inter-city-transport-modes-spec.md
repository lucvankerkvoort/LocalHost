# Inter-City Transport Modes (Planner + Globe)

## Scope
- Add explicit inter-city transport modes (flight, train, drive, boat) to planner/orchestrator output.
- Use LLM-selected inter-city mode per day-to-day transition when no user override is set.
- Apply user-provided transport preference as a hard override for inter-city route modes.
- Update globe route rendering to visualize distinct modes, including boat.

## Exclusions
- No new routing APIs or real-world route polyline generation for inter-city travel.
- No changes to intra-day `generate_route` behavior (still used for within-day navigation).
- No changes to booking, host selection, or itinerary data persistence beyond the added field.

## Constraints & Invariants
- Existing trip plans without inter-city transport data must still render without errors.
- If a user transport preference is provided (and is not "no preference"), it **must** override any LLM-provided inter-city mode.
- If no user override is provided, the LLM-provided inter-city mode is used.
- If no LLM mode is available for a leg, fallback mode is `flight` (existing behavior) to avoid breaking route rendering.
- Inter-city mode values are limited to: `flight`, `train`, `drive`, `boat`.
- The last day must have `interCityTransportToNext = null`.
- The globe must support `boat` as a `TravelRoute` mode.

## Data Model Changes
- `DraftItinerarySchema.days[].interCityTransportToNext`: nullable enum (`flight | train | drive | boat`).
- `DayPlanSchema.interCityTransportToNext`: nullable enum, optional to allow legacy plans.
- `TravelRoute.mode`: add `boat`.

## Data Flow
1. **Draft (LLM)**: LLM returns `interCityTransportToNext` for each day except last; `null` for last day.
2. **Hydration**: `processDay` passes `interCityTransportToNext` from draft into the final `DayPlan`.
3. **Draft Plan Build**: `buildDraftPlan` propagates `interCityTransportToNext` from draft into its days.
4. **Route Conversion**:
   - If `Transport between cities:` is present in the plan request and not `no preference`, override route mode for all inter-day routes.
   - Else use `day.interCityTransportToNext` for the inter-day leg.
   - Else fallback to `flight`.

## UI Rendering Requirements
- Globe inter-city routes must visually distinguish transport modes:
  - `flight`: thin geodesic arc (sky blue)
  - `train`: thicker rhumb line (green)
  - `drive`: thicker rhumb line (orange)
  - `boat`: thin geodesic arc (teal/blue)
  - `walk`: thin rhumb line (gray) (only possible via override)

## Test Requirements
- Update unit tests for `convertPlanToGlobeData` to assert:
  - Inter-day routes use LLM-provided `interCityTransportToNext` when no override.
  - Inter-day routes use user override even if LLM mode differs.
  - Boat mode is accepted and preserved.
- Update `ItineraryPlanSchema` tests to include the new field and verify invalid values are rejected.

## Acceptance Criteria (Pass/Fail)
1. A plan with `day[0].interCityTransportToNext = 'train'` produces an inter-day route with `mode = 'train'` when no override is provided.
2. A plan request containing `Transport between cities: drive.` forces all inter-day routes to `mode = 'drive'` regardless of LLM output.
3. `TravelRoute` accepts `boat`, and the globe renders boat routes without runtime errors.
4. Existing plans without `interCityTransportToNext` still render with `mode = 'flight'` for inter-day routes.
5. All updated unit tests pass.
