# ROAD_TRIP Implementation Blueprint

**Version:** 1.0  
**Status:** Draft  
**Parent Specification:** road-trip-invariants-spec.md  
**Last Updated:** 2026-02-08  

---

## 1. System Components

### 1.1 Component Registry

| Component | Responsibility | State Modification Rights |
|-----------|----------------|---------------------------|
| **ItineraryPlanner** | Orchestrates LLM-based draft generation | WRITE (draft only) |
| **DraftValidator** | Validates LLM output against directionality and pacing invariants | READ-ONLY |
| **GeocodingService** | Resolves place names to coordinates | READ-ONLY (returns data, does not persist) |
| **GeoValidator** | Validates coordinates against trust boundaries | READ-ONLY |
| **RouteService** | Provides route polylines for named routes | READ-ONLY |
| **CorridorValidator** | Checks waypoint adherence to route corridors | READ-ONLY |
| **RepairEngine** | Applies automated fixes to recoverable violations | WRITE (constrained) |
| **ViolationLogger** | Records all violations for audit trail | WRITE (logs only) |
| **ItineraryPersister** | Commits validated itinerary to storage | WRITE (final) |

### 1.2 Ownership Boundaries

**ItineraryPlanner** MUST NOT persist any data. It produces draft objects only.

**DraftValidator**, **GeoValidator**, and **CorridorValidator** MUST NOT modify itinerary state. They return validation results only.

**RepairEngine** MAY modify itinerary state but MUST log every modification as a Violation object with `autoFixApplied: true`.

**ItineraryPersister** MUST NOT accept itineraries that have unresolved BLOCKING violations.

### 1.3 Data Flow

```
User Request
    ↓
ItineraryPlanner (Draft Generation)
    ↓
DraftValidator (INV-DIR-*, INV-PACE-*)
    ↓ [BLOCKING failures → Regeneration]
GeocodingService (Resolve Locations)
    ↓
GeoValidator (INV-GEO-*)
    ↓ [BLOCKING failures → RepairEngine]
RouteService (Fetch Polyline)
    ↓
CorridorValidator (INV-CORR-*)
    ↓ [WARN violations → Annotate]
RepairEngine (Apply Fixes)
    ↓
ViolationLogger (Record All)
    ↓
ItineraryPersister (Commit)
```

---

## 2. Validation Pipeline

### 2.1 Stage Definitions

| Stage | Order | Components Involved | Invariants Checked |
|-------|-------|---------------------|-------------------|
| **DRAFT** | 1 | DraftValidator | INV-DIR-01, INV-DIR-02, INV-DIR-03, INV-PACE-01, INV-PACE-03, INV-PACE-04 |
| **GEOCODING** | 2 | GeocodingService, GeoValidator | INV-GEO-01, INV-GEO-02, INV-GEO-03, INV-GEO-04, INV-GEO-05 |
| **CORRIDOR** | 3 | RouteService, CorridorValidator | INV-CORR-01, INV-CORR-02, INV-CORR-03, INV-DIR-04 |
| **PACING** | 4 | DraftValidator (re-check) | INV-PACE-02 |
| **REPAIR** | 5 | RepairEngine | All repairable violations |
| **PRE-PERSIST** | 6 | Final gate check | All BLOCKING violations must be resolved |

### 2.2 Blocking vs Non-Blocking

| Invariant | Severity | Stage | Blocking? |
|-----------|----------|-------|-----------|
| INV-DIR-01 | ERROR | DRAFT | YES |
| INV-DIR-02 | ERROR | DRAFT | YES |
| INV-DIR-03 | ERROR | DRAFT | YES |
| INV-DIR-04 | ERROR | CORRIDOR | YES |
| INV-PACE-01 | ERROR | DRAFT | YES |
| INV-PACE-02 | WARN | PACING | NO |
| INV-PACE-03 | ERROR | DRAFT | YES |
| INV-PACE-04 | WARN | DRAFT | NO |
| INV-GEO-01 | ERROR | GEOCODING | YES (repairable) |
| INV-GEO-02 | ERROR | GEOCODING | YES (repairable) |
| INV-GEO-03 | ERROR | GEOCODING | YES (repairable) |
| INV-GEO-04 | ERROR | GEOCODING | YES (repairable) |
| INV-GEO-05 | N/A | GEOCODING | Defines repair strategy |
| INV-CORR-01 | WARN | CORRIDOR | NO |
| INV-CORR-02 | WARN | CORRIDOR | NO |
| INV-CORR-03 | WARN | CORRIDOR | NO |

### 2.3 Stage Failure Actions

**DRAFT Stage Failure:**
- If any BLOCKING violation is detected, the system MUST reject the draft.
- The system MUST invoke ItineraryPlanner with regeneration context.
- Maximum regeneration attempts: 3.
- After 3 failures, the system MUST return an error to the caller with all violations.

**GEOCODING Stage Failure:**
- If a violation is detected, the system MUST invoke RepairEngine before proceeding.
- RepairEngine applies INV-GEO-05 fallback strategy.
- If repair fails, the location MUST be marked as `confidence: FAILED` and excluded from map rendering.
- The system MUST NOT block on geocoding failures if fallback is available.

**CORRIDOR Stage Failure:**
- All violations are NON-BLOCKING.
- Violations MUST be logged and attached to the itinerary response.
- UI MAY display deviations but MUST NOT block rendering.

---

## 3. Invariant Implementation Mapping

### 3.1 INV-DIR-01: No Backward Progress (Distance-Based)

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of day anchors with (lat, lng), Origin coordinates |
| **Computation** | For each Day[N], compute haversine distance from Origin. Compare to Day[N-1]. |
| **Failure Condition** | `distance(Day[N], Origin) < distance(Day[N-1], Origin)` for any N > 1 |
| **Allowed Repair** | NONE |
| **Regeneration** | REQUIRED |

### 3.2 INV-DIR-02: Positive Cardinal Progress

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of day anchors, Origin, Terminus |
| **Computation** | Compute remaining distance to Terminus for each day. Must be monotonically decreasing. |
| **Failure Condition** | `distance(Day[N], Terminus) >= distance(Day[N-1], Terminus)` |
| **Allowed Repair** | NONE |
| **Regeneration** | REQUIRED |

### 3.3 INV-DIR-03: No Origin After Day 1

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of day anchors, Origin, TripType |
| **Computation** | For each Day[N] where N > 1, check if anchor is within 10 miles of Origin. |
| **Failure Condition** | `distance(Day[N], Origin) < 10 miles` AND `TripType != ROUND_TRIP` OR `N != FinalDay` |
| **Allowed Repair** | NONE |
| **Regeneration** | REQUIRED |

### 3.4 INV-DIR-04: Monotonic Route Progress

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of day anchors, Route polyline |
| **Computation** | Project each anchor onto polyline. Compute distance-along-polyline from start. |
| **Failure Condition** | `routeProgress(Day[N]) < routeProgress(Day[N-1])` |
| **Allowed Repair** | NONE |
| **Regeneration** | REQUIRED |
| **Fallback** | If no polyline available, skip this check and rely on INV-DIR-01/02 |

### 3.5 INV-PACE-01: Minimum Activities Per Day

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of days with activities list |
| **Computation** | Count activities per day, excluding items with `type: TRANSIT` |
| **Failure Condition** | `activities.filter(a => a.type != TRANSIT).length < 2` |
| **Allowed Repair** | RepairEngine MAY inject placeholder activities |
| **Regeneration** | REQUIRED if repair not available |

### 3.6 INV-PACE-02: Daily Mileage Cap

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Consecutive anchor coordinates |
| **Computation** | `haversine(Day[N-1].anchor, Day[N].anchor) * 1.3` (road factor) |
| **Failure Condition** | `distance > 400 miles` |
| **Allowed Repair** | NONE (advisory only) |
| **Regeneration** | NOT REQUIRED |

### 3.7 INV-PACE-03: No Empty Days

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of days with activities |
| **Computation** | For each day, check if at least one non-transit activity exists |
| **Failure Condition** | `activities.length == 0` OR all activities are `type: TRANSIT` |
| **Allowed Repair** | RepairEngine MUST inject at least one stop |
| **Regeneration** | REQUIRED if repair fails |

### 3.8 INV-PACE-04: Activity Variance

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Array of days with activity counts |
| **Computation** | Calculate variance across days. |
| **Failure Condition** | `max(counts) / min(counts) > 1.5` |
| **Allowed Repair** | NONE (advisory only) |
| **Regeneration** | NOT REQUIRED |

### 3.9 INV-GEO-01: Trust Boundary (Regional)

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Coordinate (lat, lng), Region identifier |
| **Computation** | Check coordinate against region bounding box |
| **Failure Condition** | `lat NOT IN [region.minLat, region.maxLat]` OR `lng NOT IN [region.minLng, region.maxLng]` |
| **Allowed Repair** | Re-geocode with enhanced context per INV-GEO-05 |
| **Regeneration** | NOT REQUIRED if repair succeeds |

### 3.10 INV-GEO-02: Null Island Detection

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Coordinate (lat, lng) |
| **Computation** | Check for exact (0, 0) |
| **Failure Condition** | `lat == 0 AND lng == 0` |
| **Allowed Repair** | Re-geocode with enhanced context |
| **Regeneration** | NOT REQUIRED if repair succeeds |

### 3.11 INV-GEO-03: Isolated Point Detection

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Coordinate, all other waypoint coordinates |
| **Computation** | Find minimum distance to any other waypoint |
| **Failure Condition** | `min(distance to all others) > 500 miles` |
| **Allowed Repair** | Interpolate between adjacent valid waypoints |
| **Regeneration** | NOT REQUIRED if repair succeeds |

### 3.12 INV-GEO-04: Ocean Detection (US)

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Coordinate (lat, lng), Region = US |
| **Computation** | Check longitude bounds |
| **Failure Condition** | `lng > -50 OR lng < -170` |
| **Allowed Repair** | Re-geocode with enhanced context |
| **Regeneration** | NOT REQUIRED if repair succeeds |

### 3.13 INV-CORR-01: Named Route Polyline Availability

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | User prompt, Route database |
| **Computation** | Parse prompt for named routes. Query RouteService. |
| **Failure Condition** | Named route detected but no polyline available |
| **Allowed Repair** | Log warning, proceed without corridor checks |
| **Regeneration** | NOT REQUIRED |

### 3.14 INV-CORR-02: Anchor Deviation

| Attribute | Value |
|-----------|-------|
| **Required Inputs** | Anchor coordinate, Route polyline |
| **Computation** | Compute perpendicular distance from anchor to polyline |
| **Failure Condition** | `distance > CORRIDOR_MAX_DEVIATION_MILES (50)` |
| **Allowed Repair** | NONE (annotate only) |
| **Regeneration** | NOT REQUIRED |

---

## 4. Route Progress Model

### 4.1 Computation Hierarchy

When computing "forward progress," the system MUST use the following priority:

1. **Route-Projection Distance** (preferred): If a route polyline is available, project each day's anchor onto the polyline and compute the distance along the polyline from the origin end.

2. **Cardinal Distance** (fallback): If no polyline is available, compute the haversine distance from each anchor to the Terminus. Progress is defined as reduction in this distance.

3. **Radial Distance** (last resort): Compute haversine distance from Origin. This is the weakest measure and SHOULD only be used when Terminus is not defined.

### 4.2 Projection Algorithm (High-Level)

1. Decompose the polyline into line segments.
2. For each anchor, find the nearest segment.
3. Compute the perpendicular projection point onto that segment.
4. Sum the lengths of all preceding segments plus the distance from the segment start to the projection point.
5. This sum is the "route progress" value.

### 4.3 Edge Cases

- If an anchor projects onto a segment that is earlier in the polyline than the previous day's anchor, this is a DIRECTIONAL_VIOLATION (INV-DIR-04).
- If an anchor is more than `CORRIDOR_MAX_DEVIATION_MILES` from the nearest segment, the projection MAY still be computed for ordering purposes, but a CORRIDOR_VIOLATION (INV-CORR-02) MUST be logged.

---

## 5. Marker Trust & Geocoding

### 5.1 Trust Boundary Model

The system MUST define regional trust boundaries as static configuration:

| Region | Latitude Range | Longitude Range |
|--------|----------------|-----------------|
| US_CONTINENTAL | 24.5 to 49.5 | -125.0 to -66.0 |
| US_ALASKA | 51.0 to 71.5 | -180.0 to -130.0 |
| US_HAWAII | 18.5 to 22.5 | -161.0 to -154.0 |
| EUROPE | 35.0 to 71.0 | -11.0 to 40.0 |
| MEXICO | 14.5 to 32.7 | -118.5 to -86.5 |

### 5.2 Validation Sequence

For each geocoded coordinate:

1. Check INV-GEO-02 (Null Island). If failed, proceed to repair.
2. Determine applicable region from trip context.
3. Check INV-GEO-01 (Regional Bounds). If failed, proceed to repair.
4. Check INV-GEO-04 (Ocean Detection). If failed, proceed to repair.
5. Check INV-GEO-03 (Isolation). If failed, proceed to repair.

### 5.3 Repair Strategies (INV-GEO-05)

**Strategy 1: Enhanced Re-Geocoding**
- Append state/region and country to the place name.
- Example: "Kingman" → "Kingman, AZ, USA"
- Re-invoke GeocodingService with enhanced query.
- If new result passes validation, use it.

**Strategy 2: Interpolation**
- Compute midpoint between previous valid anchor and next valid anchor.
- Mark coordinate as `confidence: INTERPOLATED`.
- Interpolated coordinates MUST NOT be persisted as canonical location data.
- Interpolated coordinates MAY be used for map rendering only.

**Strategy 3: Exclusion**
- If interpolation is impossible (first or last waypoint with no valid neighbors), mark as `confidence: FAILED`.
- Exclude from map rendering.
- Log error with full context.

### 5.4 Persistence Rules

The system MUST NOT persist:
- Interpolated coordinates as the canonical location.
- Coordinates that failed all validation without repair.

The system MUST persist:
- A `geocodingConfidence` field alongside each location.
- The original query string used for geocoding.
- A flag indicating if repair was applied.

---

## 6. Corridor Adherence

### 6.1 Named Route Resolution

The system MUST maintain a static or API-backed registry of named routes:

| Route Name | Aliases | Polyline Source |
|------------|---------|-----------------|
| Route 66 | US 66, Mother Road | Static JSON |
| Pacific Coast Highway | PCH, CA-1 | Static JSON |
| Blue Ridge Parkway | BRP | Static JSON |

When the user prompt contains a named route:
1. Normalize route name using alias lookup.
2. Fetch polyline from RouteService.
3. If polyline is unavailable, log warning and skip corridor validation.

### 6.2 Deviation Thresholds

| Entity Type | Maximum Deviation | Violation Severity |
|-------------|-------------------|-------------------|
| Day Anchor | 50 miles | WARN |
| Activity Location | 75 miles | WARN |
| Overnight Stop | 50 miles | WARN |

### 6.3 Detour Handling

If any location exceeds the deviation threshold:
1. Log a Violation object with code `CORRIDOR_DEVIATION`.
2. Include the computed deviation distance in `metrics`.
3. Set `suggestedFix` to "Consider waypoint closer to route."
4. The system MUST NOT auto-repair corridor deviations.
5. The UI SHOULD display a visual indicator for deviated locations.

---

## 7. Daily Pacing Model

### 7.1 Substantive Activity Definition

A "substantive activity" is any activity that:
- Has a physical location (lat/lng).
- Has an expected duration of at least 15 minutes.
- Is NOT of type `TRANSIT`, `DRIVE`, or `TRAVEL`.

Activities that count:
- SIGHT, EXPERIENCE, MEAL, LODGING, PARK, MUSEUM, LANDMARK

Activities that do NOT count:
- TRANSIT, DRIVE, REST_STOP (if duration < 15 min)

### 7.2 Driving Hours Impact

If estimated driving time for a day exceeds 6 hours:
- Minimum substantive activity count reduces from 2 to 1.
- At least 1 en-route stop MUST be scheduled (may be REST_STOP with 15+ min duration).

### 7.3 Unused Day Resolution

If a day has 0 substantive activities after draft generation:

**Option 1 (Preferred): Insert Stop**
- RepairEngine queries GeocodingService for notable locations between previous and next anchor.
- Insert 1-2 activities automatically.
- Mark activities as `source: AUTO_GENERATED`.

**Option 2: Slow Pacing**
- If the day represents intentional slow travel (e.g., scenic drive), annotate as `pacingMode: SCENIC`.
- Allow 0 activities but require explicit justification in the draft.

---

## 8. Violation Object Schema

### 8.1 Required Fields

| Field | Type | Description |
|-------|------|-------------|
| code | string | Invariant code (e.g., INV-DIR-01, INV-GEO-04) |
| severity | enum | ERROR or WARN |
| entityType | string | DAY, ANCHOR, ACTIVITY, ROUTE |
| entityId | string | Unique identifier of the violating entity |
| message | string | Human-readable explanation |
| metrics | object | Relevant measurements (distance, count, etc.) |
| suggestedFix | string | Optional guidance for resolution |
| autoFixApplied | boolean | TRUE if RepairEngine modified the entity |
| timestamp | ISO 8601 | When the violation was detected |

### 8.2 Example Violation

```
{
  "code": "INV-GEO-04",
  "severity": "ERROR",
  "entityType": "ANCHOR",
  "entityId": "day-3-anchor",
  "message": "Longitude -160.1 is outside the US continental trust boundary [-125, -66]",
  "metrics": {
    "lat": 34.2,
    "lng": -160.1,
    "trustBoundary": "US_CONTINENTAL"
  },
  "suggestedFix": "Re-geocode with enhanced context: Kingman, AZ, USA",
  "autoFixApplied": true,
  "timestamp": "2026-02-08T20:15:00Z"
}
```

### 8.3 Logging Requirements

- All violations MUST be logged to ViolationLogger before any repair is attempted.
- The ViolationLogger MUST persist logs independently of itinerary storage.
- Logs MUST be queryable by tripId, invariant code, and severity.

### 8.4 Response Attachment

The final itinerary response MUST include:
- An array of all violations detected (including repaired ones).
- A summary count: `{ errors: N, warnings: M, autoFixed: K }`.

---

## 9. Repair vs Regeneration Rules

### 9.1 Decision Matrix

| Violation Code | Repairable? | Repair Method | Regeneration Trigger |
|----------------|-------------|---------------|---------------------|
| INV-DIR-01 | NO | — | ALWAYS |
| INV-DIR-02 | NO | — | ALWAYS |
| INV-DIR-03 | NO | — | ALWAYS |
| INV-DIR-04 | NO | — | ALWAYS |
| INV-PACE-01 | YES | Insert placeholder activities | If repair fails |
| INV-PACE-02 | NO | — | NEVER (advisory) |
| INV-PACE-03 | YES | Insert en-route stop | If repair fails |
| INV-PACE-04 | NO | — | NEVER (advisory) |
| INV-GEO-01 | YES | Enhanced re-geocoding | If repair fails after 2 attempts |
| INV-GEO-02 | YES | Enhanced re-geocoding | If repair fails after 2 attempts |
| INV-GEO-03 | YES | Interpolation | NEVER (render-only fallback) |
| INV-GEO-04 | YES | Enhanced re-geocoding | If repair fails after 2 attempts |
| INV-CORR-01 | NO | — | NEVER (proceed without corridor) |
| INV-CORR-02 | NO | — | NEVER (annotate only) |

### 9.2 Repair Order

When multiple violations exist, RepairEngine MUST process them in this order:

1. INV-GEO-02 (Null Island) — Must fix coordinates before other checks.
2. INV-GEO-04 (Ocean Detection) — Critical location error.
3. INV-GEO-01 (Trust Boundary) — Regional validation.
4. INV-GEO-03 (Isolation) — Depends on other coordinates being valid.
5. INV-PACE-03 (Empty Days) — Requires valid locations.
6. INV-PACE-01 (Minimum Activities) — Requires valid days.

### 9.3 Regeneration Protocol

When regeneration is required:

1. Compile all BLOCKING violations into regeneration context.
2. Append explicit constraints to the LLM prompt:
   - "Day 3 MUST be located between Day 2 (X) and Day 4 (Y)."
   - "Do NOT return to Los Angeles after Day 1."
3. Increment regeneration counter.
4. If counter exceeds 3, abort and return error with all violations.

---

## 10. Testing & Enforcement

### 10.1 Unit Tests Per Invariant Category

**Directionality (INV-DIR-*)**
- Test: 3-day trip with Day 2 closer to origin than Day 1 → MUST fail INV-DIR-01.
- Test: Round-trip with origin on final day → MUST pass INV-DIR-03.
- Test: One-way with origin on Day 3 → MUST fail INV-DIR-03.
- Test: Route with out-of-order projection → MUST fail INV-DIR-04.

**Pacing (INV-PACE-*)**
- Test: Day with 0 activities → MUST fail INV-PACE-01.
- Test: Day with 1 activity (6+ hour drive) → MUST pass INV-PACE-01.
- Test: Day with only TRANSIT activities → MUST fail INV-PACE-03.
- Test: 3-day trip with activity counts [5, 1, 5] → MUST warn INV-PACE-04.

**Geocoding (INV-GEO-*)**
- Test: Coordinate (0, 0) → MUST fail INV-GEO-02.
- Test: Coordinate (34.2, -160.1) for US trip → MUST fail INV-GEO-04.
- Test: Coordinate 600 miles from all others → MUST fail INV-GEO-03.
- Test: Enhanced re-geocoding fixes invalid coordinate → MUST pass after repair.

**Corridor (INV-CORR-*)**
- Test: Anchor 30 miles from Route 66 → MUST pass INV-CORR-02.
- Test: Anchor 80 miles from Route 66 → MUST warn INV-CORR-02.
- Test: Route "Highway 66" resolves to Route 66 polyline → MUST pass INV-CORR-01.

### 10.2 Integration Tests

**LA → Chicago via Route 66**
- Input: "Road trip from Los Angeles to Chicago along Route 66, 7 days"
- Assert: No day anchor is in Los Angeles after Day 1.
- Assert: All anchors within 50 miles of Route 66 polyline.
- Assert: Route progress is monotonically increasing.
- Assert: No coordinates in the Pacific Ocean.
- Assert: Each day has at least 1 substantive activity.

**NYC → Miami Coastal Drive**
- Input: "Road trip from New York to Miami along the coast, 5 days"
- Assert: All anchors are on the eastern seaboard.
- Assert: Latitude decreases monotonically (heading south).

### 10.3 Regression Tests

Based on historical failures:

| Test Case | Expected Outcome |
|-----------|------------------|
| Kingman, AZ resolves to Pacific Ocean | Enhanced geocoding returns (35.19, -114.05) |
| Day 6 returns to LA on one-way trip | Regeneration triggered, Day 6 removed or relocated |
| Day 4 has 0 activities | RepairEngine injects en-route stop |
| Flagstaff selected, 87 miles off Route 66 | CORRIDOR_DEVIATION warning logged |

### 10.4 Enforcement Automation

All invariant checks MUST be runnable as:
- Pre-commit hooks (for test data fixtures).
- CI pipeline stage (for integration tests).
- Runtime middleware (for production validation).

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Anchor | The primary location for a day (overnight stop or central base) |
| Corridor | The geographic band around a named route |
| Polyline | An ordered array of (lat, lng) points defining a route |
| Projection | The perpendicular point on a polyline nearest to a given coordinate |
| Trust Boundary | The valid geographic region for a trip's coordinates |
| Regeneration | Requesting a new LLM draft with additional constraints |
| Repair | Automated fix applied without regeneration |

---

## Appendix B: Configuration Defaults

| Constant | Value |
|----------|-------|
| CORRIDOR_MAX_DEVIATION_MILES | 50 |
| MAX_DAILY_DRIVE_MILES | 400 |
| MAX_DRIVE_HOURS_NO_STOP | 6 |
| MIN_ACTIVITIES_PER_DAY | 2 |
| ISOLATED_POINT_THRESHOLD_MILES | 500 |
| MAX_REGENERATION_ATTEMPTS | 3 |
| ENHANCED_GEOCODE_MAX_ATTEMPTS | 2 |

---

*End of Blueprint*
