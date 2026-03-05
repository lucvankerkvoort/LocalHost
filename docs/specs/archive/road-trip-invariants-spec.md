# ROAD_TRIP Planning Invariants Specification

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** 2026-02-08  

---

## 1. Executive Summary

This specification defines the invariants, constraints, and validation rules for `ROAD_TRIP` mode itinerary generation. It addresses critical failures observed in test cases (e.g., LA → Chicago via Route 66) where the planner violated directional logic, produced invalid coordinates, and failed to respect route corridors.

---

## 2. Failure Analysis

### 2.1 Test Case: LA → Chicago via Route 66

| Failure | Observed Behavior | Root Cause |
|---------|-------------------|------------|
| **Origin Loop-Back** | Itinerary returned to Los Angeles after reaching intermediate waypoints | No directional monotonicity constraint; planner treats trip as unordered set of POIs |
| **Underutilized Days** | Days 4-6 contained minimal activities despite ample driving distance | No minimum activity threshold per day; LLM optimized for brevity |
| **Invalid Coordinates** | Kingman, AZ resolved to Pacific Ocean (lat: 34.2, lng: -160.1) | Geocoding returned ambiguous result; no geographic bounds validation |
| **Corridor Violation** | Flagstaff selected despite being 100+ miles off Route 66 | No corridor adherence constraint; planner selected "interesting" cities without route context |

---

## 3. Definitions

| Term | Definition |
|------|------------|
| **Origin** | The starting location of a ROAD_TRIP. MUST be explicitly stated or inferred from user prompt. |
| **Terminus** | The ending location of a ROAD_TRIP. MAY be the same as Origin (round-trip) or different (one-way). |
| **Route Corridor** | The geographic band within which all waypoints MUST fall. Defined by a polyline and maximum deviation distance. |
| **Cardinal Progress** | The net directional movement from Origin toward Terminus across consecutive days. |
| **Day Utilization** | A metric representing the density of planned activities relative to available time. |
| **Waypoint** | Any overnight stop or day anchor along the route. |
| **Trust Boundary** | The geographic region within which geocoded coordinates are considered valid. |

---

## 4. Invariants

### 4.1 ROAD_TRIP Directionality

> **INV-DIR-01**: The planner MUST NOT produce an itinerary where `Day[N].anchor` is geographically closer to `Origin` than `Day[N-1].anchor`, unless the trip type is explicitly `ROUND_TRIP`.

> **INV-DIR-02**: For one-way trips, each day's anchor location MUST exhibit positive Cardinal Progress toward the Terminus.

> **INV-DIR-03**: The planner MUST NOT schedule activities in the Origin city after Day 1, unless the trip type is `ROUND_TRIP` and it is the final day.

> **INV-DIR-04**: For `ROAD_TRIP` with a Route Corridor polyline available, each day’s anchor MUST have non-decreasing route-progress (projection distance along the polyline), not merely non-decreasing distance-from-origin.

#### Enforcement Mechanisms
- **Post-Generation Validator**: After LLM generates draft, compute distance-from-origin for each day. If `distance(Day[N]) < distance(Day[N-1])`, flag as DIRECTIONAL_VIOLATION.
- **Rejection Action**: If validation fails, the system MUST reject the draft and request regeneration with explicit directional guidance.

---

### 4.2 Daily Pacing & Utilization

> **INV-PACE-01**: Each day (except travel-only days) MUST contain a minimum of 2 substantive activities (excluding transit).

> **INV-PACE-02**: The daily driving distance for ROAD_TRIP mode SHOULD NOT exceed 400 miles per day under normal conditions.

> **INV-PACE-03**: The planner MUST NOT produce "empty" days where the only activity is driving. If driving exceeds 6 hours, at least 1 en-route stop MUST be scheduled.

> **INV-PACE-04**: The planner SHOULD distribute activities evenly across available days. Variance in activity count between days SHOULD NOT exceed 50%.

#### Enforcement Mechanisms
- **Activity Counter**: After draft generation, count `activities.length` per day. If any day has < 2, inject placeholder activities or escalate for review.
- **Mileage Calculator**: Use straight-line distance between consecutive anchors (with 1.3x road factor). Warn if > 400 miles.

---

### 4.3 Route Corridor Adherence

> **INV-CORR-01**: For named routes (e.g., "Route 66", "Pacific Coast Highway"), the planner MUST obtain or approximate the route polyline and constrain all waypoints to within `CORRIDOR_MAX_DEVIATION_MILES` (default: 50 miles).

> **INV-CORR-02**: The planner MUST NOT select an anchor location that is > `CORRIDOR_MAX_DEVIATION_MILES` from the route centerline, unless the user explicitly requests a detour.

> **INV-CORR-03**: When a named route is specified, the planner SHOULD prefer towns and cities that are historically or geographically associated with that route.

#### Enforcement Mechanisms
- **Route Lookup**: Maintain a static or API-fetched dataset of major named routes with polyline coordinates.
- **Point-to-Line Distance**: For each proposed anchor, compute perpendicular distance to the route polyline. Reject if > threshold.
- **Named Route Hint Injection**: When a named route is detected in the user prompt, inject route waypoint suggestions into the LLM context.

---

### 4.4 Marker Validation & Geocoding Trust Boundaries

> **INV-GEO-01**: A geocoded coordinate MUST be rejected if it falls outside the **Continental Trust Boundary** for the trip region.
> - For US trips: `lat ∈ [24.5, 49.5]`, `lng ∈ [-125.0, -66.0]`
> - For European trips: `lat ∈ [35.0, 71.0]`, `lng ∈ [-11.0, 40.0]`

> **INV-GEO-02**: A geocoded coordinate MUST be rejected if `lat === 0 && lng === 0` (null island).

> **INV-GEO-03**: A geocoded coordinate MUST be rejected if it is > 500 miles from any other waypoint in the trip (isolated point detection).

> **INV-GEO-04**: For US-based trips, coordinates with `lng > -50` or `lng < -170` MUST be rejected as Pacific/Atlantic violations.

> **INV-GEO-05**: When geocoding fails validation, the system MUST:
> 1. Attempt geocoding with enhanced context (`"Kingman, AZ, USA"` instead of `"Kingman"`).
> 2. If still invalid, use interpolated coordinates between previous and next valid waypoints.
> 3. If interpolation is impossible (first/last day), log error and exclude from map rendering.

#### Enforcement Mechanisms
- **Pre-Storage Validator**: Before persisting any location, run through all GEO invariants.
- **Fallback Geocoder**: Implement a secondary geocoding request with country/state context appended.

---

### 4.5 Handling Unresolved or Ambiguous Locations

> **INV-AMBIG-01**: If geocoding returns multiple candidates with confidence scores, the system MUST select the candidate that:
> 1. Falls within the Route Corridor (if applicable), OR
> 2. Is closest to the interpolated position between adjacent days.

> **INV-AMBIG-02**: If no candidate meets INV-AMBIG-01 criteria, the system MUST NOT silently select the first result. Instead, it MUST:
> 1. Log a warning with all candidates and their coordinates.
> 2. Use interpolated fallback coordinates.
> 3. Mark the location as `confidence: LOW` in the response.

> **INV-AMBIG-03**: Locations resolved with `confidence: LOW` SHOULD be visually distinguished in the UI (e.g., dashed marker outline, warning icon).

---

## 5. Forbidden Behaviors

The planner MUST NOT:

| ID | Forbidden Behavior |
|----|--------------------|
| FB-01 | Return to the Origin city on any day other than Day 1 (for one-way) or Final Day (for round-trip). |
| FB-02 | Produce a day with 0 activities (excluding designated "rest days" explicitly requested). |
| FB-03 | Accept coordinates outside the Continental Trust Boundary without explicit override. |
| FB-04 | Select waypoints > 50 miles off a named route corridor without logging a deviation justification. |
| FB-05 | Schedule driving segments > 8 hours without an intermediate stop. |
| FB-06 | Silently discard a day due to geocoding failure without logging and notifying the caller. |

---

## 6. Validation Checkpoints

Validation MUST occur at these stages:

| Stage | Validations | Action on Failure |
|-------|-------------|-------------------|
| **Draft Generation** | INV-DIR-01, INV-PACE-01 | Request LLM regeneration with violation context |
| **Geocoding** | INV-GEO-01 through INV-GEO-05 | Fallback geocode or interpolate |
| **Post-Processing** | INV-CORR-01, INV-CORR-02, activity count | Log deviation, mark low-confidence |
| **Pre-Render** | All | Exclude invalid markers from globe |

---

## 7. Data Requirements

To enforce these invariants, the system requires:

| Data | Purpose | Source |
|------|---------|--------|
| Route Polylines | Corridor adherence checks | Static JSON or Google Routes API |
| Continental Bounding Boxes | Trust boundary validation | Static config per region |
| Reverse Geocoding | Enhanced context for ambiguous names | Google Places / Nominatim |
| Distance Matrix | Directional progress, mileage caps | Haversine calculation or API |

---

## 8. Glossary of Constraint Constants

| Constant | Default Value | Description |
|----------|---------------|-------------|
| `CORRIDOR_MAX_DEVIATION_MILES` | 50 | Maximum perpendicular distance from route centerline |
| `MAX_DAILY_DRIVE_MILES` | 400 | Soft cap on daily driving distance |
| `MAX_DRIVE_HOURS_NO_STOP` | 6 | Maximum driving time before mandatory en-route activity |
| `MIN_ACTIVITIES_PER_DAY` | 2 | Minimum substantive activities (excluding transit) |
| `ISOLATED_POINT_THRESHOLD_MILES` | 500 | Distance at which a point is flagged as isolated |
| `US_TRUST_LAT_RANGE` | [24.5, 49.5] | Valid latitude range for continental US |
| `US_TRUST_LNG_RANGE` | [-125.0, -66.0] | Valid longitude range for continental US |

---

## 9. Implementation Notes

### 9.1 Order of Operations
1. **Parse user intent** → Identify Origin, Terminus, trip type, named route.
2. **Generate draft** → LLM produces day-by-day plan.
3. **Validate directionality** → Check Cardinal Progress.
4. **Geocode all locations** → Apply trust boundary checks.
5. **Validate corridor** → If named route, check deviations.
6. **Validate pacing** → Check activity counts and mileage.
7. **Apply fallbacks** → Interpolate or enhance queries for failures.
8. **Mark confidence** → Annotate low-confidence locations.
9. **Render** → Exclude or visually distinguish invalid/uncertain markers.

### 9.2 Non-Goals
- This specification does NOT define LLM prompt engineering strategies.
- This specification does NOT prescribe specific API providers.
- This specification does NOT define UI/UX for low-confidence markers (only that they SHOULD be distinguished).

---

## 10. Appendix: Example Violation Report

```
ROAD_TRIP Validation Report
===========================
Trip: Los Angeles → Chicago (Route 66)
Total Days: 7

Day 2: Kingman, AZ
  ❌ INV-GEO-04: Longitude -160.1 outside trust boundary [-125, -66]
  → Fallback: Re-geocoded with "Kingman, AZ, USA" → (35.19, -114.05) ✓

Day 5: Flagstaff, AZ
  ⚠️ INV-CORR-02: 87 miles from Route 66 centerline (max: 50)
  → Action: Logged deviation, marked confidence: LOW

Day 6: Los Angeles, CA
  ❌ INV-DIR-03: Origin city scheduled after Day 1 on one-way trip
  → Action: REJECTED – Regeneration required
```

---

## 11. Approval & Review

| Role | Name | Status |
|------|------|--------|
| Author | [Agent] | Complete |
| Technical Review | [Pending] | — |
| Product Review | [Pending] | — |

---

*End of Specification*
