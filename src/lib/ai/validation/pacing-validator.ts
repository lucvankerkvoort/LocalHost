/**
 * Pacing Validator
 * 
 * Validates that ROAD_TRIP itineraries have appropriate activity density
 * and day utilization.
 * 
 * Implements: INV-PACE-01, INV-PACE-02, INV-PACE-03, INV-PACE-04
 */

import {
  ValidationResult,
  ViolationObject,
  createViolation,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Minimum activities per day */
const MIN_ACTIVITIES_PER_DAY = 2;

/** Maximum driving distance per day (400 miles in meters) */
const MAX_DAILY_DRIVING_METERS = 643738; // 400 miles

/** If driving > 300 miles, reduce minimum activities to 1 */
const HIGH_DRIVING_THRESHOLD_METERS = 482803; // 300 miles

// ============================================================================
// Types
// ============================================================================

export interface DayPacing {
  dayNumber: number;
  city?: string;
  activityCount: number;
  drivingDistanceMeters?: number;
}

export interface PacingInput {
  days: DayPacing[];
}

// ============================================================================
// Validators
// ============================================================================

/**
 * INV-PACE-01: Minimum 2 activities per day (reduced to 1 for high-driving days).
 */
function checkMinimumActivities(days: DayPacing[]): ViolationObject[] {
  const violations: ViolationObject[] = [];

  for (const day of days) {
    const isHighDrivingDay = day.drivingDistanceMeters && 
      day.drivingDistanceMeters > HIGH_DRIVING_THRESHOLD_METERS;
    
    const minRequired = isHighDrivingDay ? 1 : MIN_ACTIVITIES_PER_DAY;
    
    if (day.activityCount < minRequired) {
      violations.push(
        createViolation(
          'INV-PACE-01',
          'WARN',
          'DAY',
          `day-${day.dayNumber}`,
          `Day ${day.dayNumber} (${day.city || 'unknown'}) has only ${day.activityCount} activity/activities (minimum: ${minRequired})`,
          {
            metrics: {
              dayNumber: day.dayNumber,
              activityCount: day.activityCount,
              minimumRequired: minRequired,
              isHighDrivingDay,
            },
            suggestedFix: `Add at least ${minRequired - day.activityCount} more activities to Day ${day.dayNumber}`,
          }
        )
      );
    }
  }

  return violations;
}

/**
 * INV-PACE-02: Maximum 400 miles driving per day.
 */
function checkMaxDrivingDistance(days: DayPacing[]): ViolationObject[] {
  const violations: ViolationObject[] = [];

  for (const day of days) {
    if (day.drivingDistanceMeters && day.drivingDistanceMeters > MAX_DAILY_DRIVING_METERS) {
      const drivingMiles = Math.round(day.drivingDistanceMeters / 1609.34);
      
      violations.push(
        createViolation(
          'INV-PACE-02',
          'WARN',
          'DAY',
          `day-${day.dayNumber}`,
          `Day ${day.dayNumber} has ${drivingMiles} miles of driving (maximum: 400 miles)`,
          {
            metrics: {
              dayNumber: day.dayNumber,
              drivingMiles,
              maximumMiles: 400,
            },
            suggestedFix: `Consider splitting Day ${day.dayNumber} or reducing driving distance`,
          }
        )
      );
    }
  }

  return violations;
}

/**
 * INV-PACE-03: No empty days (0 activities).
 */
function checkEmptyDays(days: DayPacing[]): ViolationObject[] {
  const violations: ViolationObject[] = [];

  for (const day of days) {
    if (day.activityCount === 0) {
      violations.push(
        createViolation(
          'INV-PACE-03',
          'ERROR',
          'DAY',
          `day-${day.dayNumber}`,
          `Day ${day.dayNumber} (${day.city || 'unknown'}) has no activities`,
          {
            metrics: {
              dayNumber: day.dayNumber,
            },
            suggestedFix: `Add at least one activity to Day ${day.dayNumber}`,
          }
        )
      );
    }
  }

  return violations;
}

/**
 * INV-PACE-04: Check for high activity variance (some days very busy, others sparse).
 */
function checkActivityVariance(days: DayPacing[]): ViolationObject[] {
  if (days.length < 2) return [];

  const counts = days.map(d => d.activityCount);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  
  // Flag if variance is > 4 activities between busiest and slowest day
  if (max - min > 4) {
    const busiestDay = days.find(d => d.activityCount === max);
    const slowestDay = days.find(d => d.activityCount === min);
    
    return [
      createViolation(
        'INV-PACE-04',
        'WARN',
        'DAY',
        'variance',
        `High activity variance: Day ${busiestDay?.dayNumber} has ${max} activities, Day ${slowestDay?.dayNumber} has ${min}`,
        {
          metrics: {
            maxActivities: max,
            minActivities: min,
            variance: max - min,
            busiestDay: busiestDay?.dayNumber,
            slowestDay: slowestDay?.dayNumber,
          },
          suggestedFix: 'Consider redistributing activities more evenly across days',
        }
      ),
    ];
  }

  return [];
}

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate pacing for a ROAD_TRIP itinerary.
 * 
 * Checks performed:
 * - INV-PACE-01: Minimum 2 activities per day (1 for high-driving days)
 * - INV-PACE-02: Maximum 400 miles driving per day
 * - INV-PACE-03: No empty days (BLOCKING)
 * - INV-PACE-04: Activity variance check
 */
export function validatePacing(input: PacingInput): ValidationResult {
  const violations: ViolationObject[] = [];

  if (input.days.length === 0) {
    return { valid: true, violations: [] };
  }

  // INV-PACE-03: Empty days (blocking)
  violations.push(...checkEmptyDays(input.days));

  // INV-PACE-01: Minimum activities
  violations.push(...checkMinimumActivities(input.days));

  // INV-PACE-02: Max driving
  violations.push(...checkMaxDrivingDistance(input.days));

  // INV-PACE-04: Variance
  violations.push(...checkActivityVariance(input.days));

  // Only PACE-03 (empty days) is blocking
  const hasBlockingViolations = violations.some(v => v.severity === 'ERROR');

  return {
    valid: !hasBlockingViolations,
    violations,
  };
}

/**
 * Get a summary of pacing quality.
 */
export function summarizePacing(result: ValidationResult): {
  hasEmptyDays: boolean;
  lowActivityDays: number;
  highDrivingDays: number;
  hasHighVariance: boolean;
} {
  return {
    hasEmptyDays: result.violations.some(v => v.code === 'INV-PACE-03'),
    lowActivityDays: result.violations.filter(v => v.code === 'INV-PACE-01').length,
    highDrivingDays: result.violations.filter(v => v.code === 'INV-PACE-02').length,
    hasHighVariance: result.violations.some(v => v.code === 'INV-PACE-04'),
  };
}
