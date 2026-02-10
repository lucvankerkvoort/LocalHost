/**
 * Validation Types
 * 
 * Shared types for the road trip validation pipeline.
 */

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Geographic trust regions with defined bounding boxes.
 * Coordinates outside these bounds are considered invalid for the region.
 */
export type TrustRegion = 
  | 'US_CONTINENTAL'
  | 'US_ALASKA'
  | 'US_HAWAII'
  | 'EUROPE'
  | 'MEXICO';

export interface TrustBoundary {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const TRUST_BOUNDARIES: Record<TrustRegion, TrustBoundary> = {
  US_CONTINENTAL: { minLat: 24.5, maxLat: 49.5, minLng: -125.0, maxLng: -66.0 },
  US_ALASKA: { minLat: 51.0, maxLat: 71.5, minLng: -180.0, maxLng: -130.0 },
  US_HAWAII: { minLat: 18.5, maxLat: 22.5, minLng: -161.0, maxLng: -154.0 },
  EUROPE: { minLat: 35.0, maxLat: 71.0, minLng: -11.0, maxLng: 40.0 },
  MEXICO: { minLat: 14.5, maxLat: 32.7, minLng: -118.5, maxLng: -86.5 },
};

// ============================================================================
// Violation Types
// ============================================================================

export type ViolationSeverity = 'ERROR' | 'WARN';

export type ViolationCode =
  // Geocoding violations
  | 'INV-GEO-01' // Outside trust boundary
  | 'INV-GEO-02' // Null Island (0, 0)
  | 'INV-GEO-03' // Isolated point (>500mi from others)
  | 'INV-GEO-04' // Ocean detection (US lng out of range)
  // Directionality violations
  | 'INV-DIR-01' // Backward progress (distance-based)
  | 'INV-DIR-02' // No cardinal progress
  | 'INV-DIR-03' // Origin after Day 1
  | 'INV-DIR-04' // Route projection regression
  // Corridor violations
  | 'INV-CORR-01' // No polyline available
  | 'INV-CORR-02' // Anchor deviation >50mi
  | 'INV-CORR-03' // Activity deviation >75mi
  // Pacing violations
  | 'INV-PACE-01' // <2 activities per day
  | 'INV-PACE-02' // >400mi daily driving
  | 'INV-PACE-03' // Empty day
  | 'INV-PACE-04'; // High activity variance

export type ViolationEntityType = 'DAY' | 'ANCHOR' | 'ACTIVITY' | 'ROUTE' | 'COORDINATE';

export interface ViolationObject {
  /** Invariant code (e.g., INV-GEO-01) */
  code: ViolationCode;
  
  /** ERROR = blocking, WARN = advisory */
  severity: ViolationSeverity;
  
  /** Type of entity that violated the invariant */
  entityType: ViolationEntityType;
  
  /** Unique identifier of the violating entity */
  entityId: string;
  
  /** Human-readable explanation */
  message: string;
  
  /** Relevant measurements (distance, count, coordinates, etc.) */
  metrics?: Record<string, unknown>;
  
  /** Optional guidance for resolution */
  suggestedFix?: string;
  
  /** TRUE if RepairEngine automatically fixed this */
  autoFixApplied: boolean;
  
  /** When the violation was detected */
  timestamp: string;
}

// ============================================================================
// Validation Result Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  violations: ViolationObject[];
}

export interface GeoValidationResult extends ValidationResult {
  /** If repair was attempted, the repaired coordinates */
  repairedCoordinate?: { lat: number; lng: number };
  
  /** Confidence level after validation/repair */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'FAILED';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a violation object with standard timestamp.
 */
export function createViolation(
  code: ViolationCode,
  severity: ViolationSeverity,
  entityType: ViolationEntityType,
  entityId: string,
  message: string,
  options?: {
    metrics?: Record<string, unknown>;
    suggestedFix?: string;
    autoFixApplied?: boolean;
  }
): ViolationObject {
  return {
    code,
    severity,
    entityType,
    entityId,
    message,
    metrics: options?.metrics,
    suggestedFix: options?.suggestedFix,
    autoFixApplied: options?.autoFixApplied ?? false,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a validation result has any blocking (ERROR) violations.
 */
export function hasBlockingViolations(result: ValidationResult): boolean {
  return result.violations.some(v => v.severity === 'ERROR');
}

/**
 * Filter violations by severity.
 */
export function filterViolations(
  violations: ViolationObject[],
  severity: ViolationSeverity
): ViolationObject[] {
  return violations.filter(v => v.severity === severity);
}
