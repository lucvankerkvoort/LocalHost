/**
 * Directionality Validator
 * 
 * Validates that ROAD_TRIP itineraries maintain forward progress from origin
 * to terminus without looping back or stagnating.
 * 
 * Implements: INV-DIR-01, INV-DIR-02, INV-DIR-03
 */

import {
  ValidationResult,
  ViolationObject,
  createViolation,
} from './types';
import type { GeoPoint } from '../types';

// ============================================================================
// Types
// ============================================================================

export type TripType = 'ONE_WAY' | 'ROUND_TRIP';

export interface DirectionalityInput {
  /** Origin coordinates (starting point) */
  origin: GeoPoint;
  
  /** Terminus coordinates (ending point). For round-trips, same as origin. */
  terminus: GeoPoint;
  
  /** Type of trip */
  tripType: TripType;
  
  /** Array of day anchors in chronological order */
  dayAnchors: Array<{
    dayNumber: number;
    lat: number;
    lng: number;
    city?: string;
  }>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate haversine distance between two points in meters.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Convert meters to miles for human-readable messages.
 */
function metersToMiles(meters: number): number {
  return Math.round(meters / 1609.34);
}

/**
 * Check if two points are within threshold distance (considered "same location").
 */
const SAME_LOCATION_THRESHOLD_METERS = 16093; // 10 miles

function isSameLocation(p1: GeoPoint, p2: GeoPoint): boolean {
  return haversineDistance(p1.lat, p1.lng, p2.lat, p2.lng) < SAME_LOCATION_THRESHOLD_METERS;
}

// ============================================================================
// Validators
// ============================================================================

/**
 * INV-DIR-01: No Backward Progress (Distance-Based)
 * 
 * Checks that each day's anchor is NOT closer to the origin than the previous day.
 */
function checkBackwardProgress(
  input: DirectionalityInput
): ViolationObject[] {
  const violations: ViolationObject[] = [];
  const { origin, dayAnchors, tripType } = input;

  if (dayAnchors.length < 2) return [];

  for (let i = 1; i < dayAnchors.length; i++) {
    const prevDay = dayAnchors[i - 1];
    const currDay = dayAnchors[i];

    // For round-trips, allow backward progress on the return leg (last third of trip)
    if (tripType === 'ROUND_TRIP') {
      const returnStartDay = Math.ceil(dayAnchors.length * 2 / 3);
      if (i >= returnStartDay) continue;
    }

    const prevDistFromOrigin = haversineDistance(origin.lat, origin.lng, prevDay.lat, prevDay.lng);
    const currDistFromOrigin = haversineDistance(origin.lat, origin.lng, currDay.lat, currDay.lng);

    // Current day should be further from origin than previous day (or roughly equal)
    const regression = prevDistFromOrigin - currDistFromOrigin;
    
    // Only flag if regression is significant (> 20 miles backward)
    if (regression > 32186) { // 20 miles in meters
      violations.push(
        createViolation(
          'INV-DIR-01',
          'ERROR',
          'DAY',
          `day-${currDay.dayNumber}`,
          `Day ${currDay.dayNumber} (${currDay.city || 'unknown'}) is ${metersToMiles(regression)} miles closer to origin than Day ${prevDay.dayNumber}`,
          {
            metrics: {
              dayNumber: currDay.dayNumber,
              previousDayNumber: prevDay.dayNumber,
              regressionMiles: metersToMiles(regression),
              currentDistFromOriginMiles: metersToMiles(currDistFromOrigin),
              previousDistFromOriginMiles: metersToMiles(prevDistFromOrigin),
            },
            suggestedFix: `Day ${currDay.dayNumber} MUST be located further from origin than Day ${prevDay.dayNumber}`,
          }
        )
      );
    }
  }

  return violations;
}

/**
 * INV-DIR-02: Positive Cardinal Progress Toward Terminus
 * 
 * Checks that each day is making progress toward the terminus (decreasing distance).
 */
function checkCardinalProgress(
  input: DirectionalityInput
): ViolationObject[] {
  const violations: ViolationObject[] = [];
  const { terminus, dayAnchors, tripType } = input;

  if (dayAnchors.length < 2 || tripType === 'ROUND_TRIP') return [];

  for (let i = 1; i < dayAnchors.length; i++) {
    const prevDay = dayAnchors[i - 1];
    const currDay = dayAnchors[i];

    const prevDistToTerminus = haversineDistance(terminus.lat, terminus.lng, prevDay.lat, prevDay.lng);
    const currDistToTerminus = haversineDistance(terminus.lat, terminus.lng, currDay.lat, currDay.lng);

    // Current day should be closer to terminus than previous day (or roughly equal)
    const regression = currDistToTerminus - prevDistToTerminus;
    
    // Only flag if regression is significant (> 20 miles backward)
    if (regression > 32186) { // 20 miles in meters
      violations.push(
        createViolation(
          'INV-DIR-02',
          'ERROR',
          'DAY',
          `day-${currDay.dayNumber}`,
          `Day ${currDay.dayNumber} (${currDay.city || 'unknown'}) is ${metersToMiles(regression)} miles further from terminus than Day ${prevDay.dayNumber}`,
          {
            metrics: {
              dayNumber: currDay.dayNumber,
              previousDayNumber: prevDay.dayNumber,
              regressionMiles: metersToMiles(regression),
              currentDistToTerminusMiles: metersToMiles(currDistToTerminus),
              previousDistToTerminusMiles: metersToMiles(prevDistToTerminus),
            },
            suggestedFix: `Day ${currDay.dayNumber} MUST be located closer to terminus than Day ${prevDay.dayNumber}`,
          }
        )
      );
    }
  }

  return violations;
}

/**
 * INV-DIR-03: No Origin After Day 1
 * 
 * Checks that the origin city is not revisited after Day 1 (except for round-trip final day).
 */
function checkOriginRevisit(
  input: DirectionalityInput
): ViolationObject[] {
  const violations: ViolationObject[] = [];
  const { origin, dayAnchors, tripType } = input;

  if (dayAnchors.length < 2) return [];

  for (let i = 1; i < dayAnchors.length; i++) {
    const day = dayAnchors[i];
    const isLastDay = i === dayAnchors.length - 1;

    // For round-trips, skip the final day (expected to return to origin)
    if (tripType === 'ROUND_TRIP' && isLastDay) continue;

    // Check if this day's anchor is at the origin
    if (isSameLocation({ lat: day.lat, lng: day.lng }, origin)) {
      violations.push(
        createViolation(
          'INV-DIR-03',
          'ERROR',
          'DAY',
          `day-${day.dayNumber}`,
          `Day ${day.dayNumber} returns to origin city, which is not allowed for ${tripType === 'ONE_WAY' ? 'one-way trips' : 'non-final days of round-trips'}`,
          {
            metrics: {
              dayNumber: day.dayNumber,
              tripType,
              distanceFromOriginMiles: metersToMiles(
                haversineDistance(origin.lat, origin.lng, day.lat, day.lng)
              ),
            },
            suggestedFix: `Day ${day.dayNumber} MUST NOT be at the origin city`,
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
 * Validate directionality for a ROAD_TRIP itinerary.
 * 
 * Checks performed:
 * - INV-DIR-01: No backward progress from origin
 * - INV-DIR-02: Positive cardinal progress toward terminus
 * - INV-DIR-03: No origin city after Day 1 (except round-trip final day)
 */
export function validateDirectionality(input: DirectionalityInput): ValidationResult {
  const violations: ViolationObject[] = [];

  // Skip validation if insufficient data
  if (input.dayAnchors.length === 0) {
    return { valid: true, violations: [] };
  }

  // Run all directional checks
  violations.push(...checkBackwardProgress(input));
  violations.push(...checkCardinalProgress(input));
  violations.push(...checkOriginRevisit(input));

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Extract origin and terminus from day anchors.
 * 
 * For ONE_WAY trips: origin = Day 1, terminus = last day.
 * For ROUND_TRIP: origin = terminus = Day 1.
 */
export function inferOriginAndTerminus(
  dayAnchors: DirectionalityInput['dayAnchors'],
  tripType: TripType
): { origin: GeoPoint; terminus: GeoPoint } | null {
  if (dayAnchors.length === 0) return null;

  const firstDay = dayAnchors[0];
  const lastDay = dayAnchors[dayAnchors.length - 1];

  const origin: GeoPoint = { lat: firstDay.lat, lng: firstDay.lng };
  const terminus: GeoPoint = tripType === 'ROUND_TRIP'
    ? origin
    : { lat: lastDay.lat, lng: lastDay.lng };

  return { origin, terminus };
}

/**
 * Build directional constraints for LLM regeneration prompt.
 * 
 * Translates violations into explicit instructions for the LLM.
 */
export function buildRegenerationConstraints(violations: ViolationObject[]): string[] {
  return violations
    .filter(v => v.code.startsWith('INV-DIR'))
    .map(v => {
      switch (v.code) {
        case 'INV-DIR-01':
        case 'INV-DIR-02':
          return v.suggestedFix || `Day ${v.metrics?.dayNumber} must maintain forward progress`;
        case 'INV-DIR-03':
          return `Do NOT return to the starting city on Day ${v.metrics?.dayNumber}`;
        default:
          return v.suggestedFix || v.message;
      }
    });
}
