# Technical Spec: Duplicate Marker Prevention & State Integrity

**Status**: PROPOSED
**Author**: Architect Agent
**Date**: 2026-02-06
**Related Issue**: "Markers already exist" Cesium crash (Debugger Report)

## 1. Objective
Eliminate the application crash caused by "markers already exist" errors in the Cesium viewer. This crash occurs when the application state contains duplicate markers (same ID), violating the mandatory invariant required by the Cesium `Entity` system.

## 2. Invariants & Constraints
### 2.1. Critical Invariant: Unique Marker IDs
The `GlobeState` in `src/store/globe-slice.ts` MUST guarantee that the following arrays contain objects with globally unique `id` properties:
- `hostMarkers`
- `routeMarkers`
- `placeMarkers`

### 2.2. Data Boundary Constraint
Any data entering the Redux store from an external source (e.g., `sessionStorage` via `hydrateGlobeState`, or AI plan generation via `setItineraryData`) MUST be sanitized to remove duplicates before assignment. The store acts as the source of truth and must never hold invalid state.

## 3. Proposed Changes

### 3.1. `src/store/globe-slice.ts`
**Role**: State Manager

1.  **Add Utility Function**: Implement a `deduplicate<T extends { id: string }>(items: T[]): T[]` helper function.
    - **Logic**: Iterate through items, keeping only the first occurrence of each `id`.

2.  **Update `hydrateGlobeState`**:
    - Wrap all marker array assignments (`routeMarkers`, `hostMarkers`, `placeMarkers`) with the `deduplicate` function.
    - **Example**: `state.hostMarkers = deduplicate(action.payload.hostMarkers);`

3.  **Update `setItineraryData`**:
    - Apply `deduplicate` to `routeMarkers` when setting them from an external payload.

### 3.2. `src/store/hosts-slice.ts`
**Role**: Build Prerequisite

1.  **Fix Build Error**: Replace the invalid import `import { createSelector } from 'reselect';` with `import { createSelector } from '@reduxjs/toolkit';`.
    - **Rationale**: `reselect` is not a direct dependency, but is re-exported by Redux Toolkit. This fix is required to build and verify the application.

## 4. Verification Plan

### 4.1. Automated Verification
- **Unit Test**: specific test case in `globe-slice.test.ts` (if logic allows) or manual verification logic.
    - Input: Payload with `[{ id: 'a' }, { id: 'a' }]`.
    - Expected Output: State has `[{ id: 'a' }]`.

### 4.2. Manual Verification
- **Scenario**: "Return to Trip".
    1. Plan a trip.
    2. Reload the page or navigate away and back (triggering hydration).
    3. Click on different days (triggering filtered renders).
    4. **Pass Criteria**: No crash in Cesium viewer; Console is free of "Entity with id ... already exists" errors.

## 5. Exclusions
- This spec does NOT require changes to `CesiumGlobe.tsx`. The fix should be at the state level (root cause), not the view level (symptom). The view component can remain naive, assuming valid state.
