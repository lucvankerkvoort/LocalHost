/**
 * Corridor Validator
 * 
 * Validates that ROAD_TRIP waypoints stay within the expected route corridor.
 * Uses the route polyline from OSRM to compute perpendicular distances.
 * 
 * Implements: INV-CORR-01, INV-CORR-02, INV-CORR-03
 */

import {
  ValidationResult,
  ViolationObject,
  createViolation,
} from './types';
import { distanceToPolyline } from '../services/route-service';
import type { GeoPoint } from '../types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum distance from route for day anchors (50 miles in meters) */
const ANCHOR_DEVIATION_THRESHOLD_METERS = 80467; // 50 miles

/** Maximum distance from route for activities (75 miles in meters) */
const ACTIVITY_DEVIATION_THRESHOLD_METERS = 120700; // 75 miles

// ============================================================================
// Types
// ============================================================================

export interface CorridorInput {
  /** Route polyline from origin to terminus */
  polyline: GeoPoint[];
  
  /** Day anchors with locations */
  dayAnchors: Array<{
    dayNumber: number;
    lat: number;
    lng: number;
    city?: string;
  }>;
  
  /** Optional: activities to validate (stricter threshold) */
  activities?: Array<{
    id: string;
    name: string;
    dayNumber: number;
    lat: number;
    lng: number;
  }>;
}

// ============================================================================
// Validators
// ============================================================================

/**
 * INV-CORR-01: Route polyline must exist for corridor validation.
 */
function checkPolylineExists(
  polyline: GeoPoint[]
): ViolationObject | null {
  if (polyline.length < 2) {
    return createViolation(
      'INV-CORR-01',
      'WARN',
      'ROUTE',
      'polyline',
      'No route polyline available for corridor validation',
      {
        metrics: { polylineLength: polyline.length },
        suggestedFix: 'Corridor validation skipped - route service may be unavailable',
      }
    );
  }
  return null;
}

/**
 * INV-CORR-02: Day anchors must be within 50 miles of route.
 */
function checkAnchorDeviation(
  dayAnchors: CorridorInput['dayAnchors'],
  polyline: GeoPoint[]
): ViolationObject[] {
  const violations: ViolationObject[] = [];

  for (const anchor of dayAnchors) {
    const distance = distanceToPolyline({ lat: anchor.lat, lng: anchor.lng }, polyline);
    
    if (distance > ANCHOR_DEVIATION_THRESHOLD_METERS) {
      const deviationMiles = Math.round(distance / 1609.34);
      
      violations.push(
        createViolation(
          'INV-CORR-02',
          'WARN',
          'ANCHOR',
          `day-${anchor.dayNumber}`,
          `Day ${anchor.dayNumber} anchor (${anchor.city || 'unknown'}) is ${deviationMiles} miles from route corridor`,
          {
            metrics: {
              dayNumber: anchor.dayNumber,
              city: anchor.city,
              deviationMeters: Math.round(distance),
              deviationMiles,
              thresholdMiles: 50,
            },
            suggestedFix: `Consider a location closer to the route for Day ${anchor.dayNumber}`,
          }
        )
      );
    }
  }

  return violations;
}

/**
 * INV-CORR-03: Activities must be within 75 miles of route.
 */
function checkActivityDeviation(
  activities: CorridorInput['activities'],
  polyline: GeoPoint[]
): ViolationObject[] {
  if (!activities || activities.length === 0) return [];

  const violations: ViolationObject[] = [];

  for (const activity of activities) {
    const distance = distanceToPolyline({ lat: activity.lat, lng: activity.lng }, polyline);
    
    if (distance > ACTIVITY_DEVIATION_THRESHOLD_METERS) {
      const deviationMiles = Math.round(distance / 1609.34);
      
      violations.push(
        createViolation(
          'INV-CORR-03',
          'WARN',
          'ACTIVITY',
          activity.id,
          `Activity "${activity.name}" on Day ${activity.dayNumber} is ${deviationMiles} miles from route corridor`,
          {
            metrics: {
              activityId: activity.id,
              activityName: activity.name,
              dayNumber: activity.dayNumber,
              deviationMeters: Math.round(distance),
              deviationMiles,
              thresholdMiles: 75,
            },
            suggestedFix: `Consider an activity closer to the route on Day ${activity.dayNumber}`,
          }
        )
      );
    }
  }

  return violations;
}

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate corridor adherence for a ROAD_TRIP itinerary.
 * 
 * Checks performed:
 * - INV-CORR-01: Route polyline exists
 * - INV-CORR-02: Day anchors within 50 miles of route
 * - INV-CORR-03: Activities within 75 miles of route (if provided)
 * 
 * All violations are NON-BLOCKING (severity: WARN).
 */
export function validateCorridorAdherence(input: CorridorInput): ValidationResult {
  const violations: ViolationObject[] = [];

  // INV-CORR-01: Check polyline exists
  const polylineViolation = checkPolylineExists(input.polyline);
  if (polylineViolation) {
    violations.push(polylineViolation);
    // Can't check other rules without polyline
    return { valid: true, violations };
  }

  // INV-CORR-02: Check anchor deviations
  violations.push(...checkAnchorDeviation(input.dayAnchors, input.polyline));

  // INV-CORR-03: Check activity deviations
  violations.push(...checkActivityDeviation(input.activities, input.polyline));

  // Corridor violations are non-blocking (warnings only)
  return {
    valid: true, // Always valid since all violations are WARN
    violations,
  };
}

/**
 * Get a summary of corridor adherence.
 */
export function summarizeCorridorAdherence(result: ValidationResult): {
  withinCorridor: boolean;
  anchorDeviations: number;
  activityDeviations: number;
} {
  const anchorDeviations = result.violations.filter(v => v.code === 'INV-CORR-02').length;
  const activityDeviations = result.violations.filter(v => v.code === 'INV-CORR-03').length;

  return {
    withinCorridor: anchorDeviations === 0 && activityDeviations === 0,
    anchorDeviations,
    activityDeviations,
  };
}
