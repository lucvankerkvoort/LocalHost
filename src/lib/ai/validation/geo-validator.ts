/**
 * Geographic Coordinate Validator
 * 
 * Validates coordinates against trust boundaries to prevent invalid locations
 * (Pacific Ocean, Null Island, etc.) from entering the system.
 * 
 * Implements: INV-GEO-01, INV-GEO-02, INV-GEO-03, INV-GEO-04
 */

import {
  TrustRegion,
  TRUST_BOUNDARIES,
  GeoValidationResult,
  ViolationObject,
  createViolation,
} from './types';

// ============================================================================
// Constants
// ============================================================================

/** Distance threshold for isolated point detection (meters) */
const ISOLATED_POINT_THRESHOLD_METERS = 804672; // 500 miles

/** US-specific longitude bounds for ocean detection */
const US_PACIFIC_MAX_LNG = -50;
const US_PACIFIC_MIN_LNG = -170;

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
 * Infer trust region from coordinates (best effort).
 */
export function inferTrustRegion(lat: number, lng: number): TrustRegion | null {
  for (const [region, bounds] of Object.entries(TRUST_BOUNDARIES)) {
    if (
      lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lng >= bounds.minLng &&
      lng <= bounds.maxLng
    ) {
      return region as TrustRegion;
    }
  }
  return null;
}

// ============================================================================
// Validators
// ============================================================================

/**
 * INV-GEO-02: Check for Null Island (0, 0).
 */
function checkNullIsland(
  lat: number,
  lng: number,
  entityId: string
): ViolationObject | null {
  if (lat === 0 && lng === 0) {
    return createViolation(
      'INV-GEO-02',
      'ERROR',
      'COORDINATE',
      entityId,
      'Coordinate is at Null Island (0, 0) - indicates geocoding failure',
      {
        metrics: { lat, lng },
        suggestedFix: 'Re-geocode with enhanced context (city, state, country)',
      }
    );
  }
  return null;
}

/**
 * INV-GEO-01: Check if coordinate is within trust boundary.
 */
function checkTrustBoundary(
  lat: number,
  lng: number,
  region: TrustRegion,
  entityId: string
): ViolationObject | null {
  const bounds = TRUST_BOUNDARIES[region];
  
  if (
    lat < bounds.minLat ||
    lat > bounds.maxLat ||
    lng < bounds.minLng ||
    lng > bounds.maxLng
  ) {
    return createViolation(
      'INV-GEO-01',
      'ERROR',
      'COORDINATE',
      entityId,
      `Coordinate (${lat.toFixed(4)}, ${lng.toFixed(4)}) is outside ${region} trust boundary`,
      {
        metrics: {
          lat,
          lng,
          region,
          bounds,
        },
        suggestedFix: 'Re-geocode with enhanced context or verify the location name',
      }
    );
  }
  return null;
}

/**
 * INV-GEO-04: Check for Pacific/Atlantic Ocean coordinates (US-specific).
 */
function checkOceanDetection(
  lat: number,
  lng: number,
  region: TrustRegion,
  entityId: string
): ViolationObject | null {
  // Only apply to US regions (excluding Hawaii/Alaska which have different lng ranges)
  if (region !== 'US_CONTINENTAL') {
    return null;
  }

  if (lng > US_PACIFIC_MAX_LNG || lng < US_PACIFIC_MIN_LNG) {
    return createViolation(
      'INV-GEO-04',
      'ERROR',
      'COORDINATE',
      entityId,
      `Longitude ${lng.toFixed(4)} is outside continental US bounds - likely ocean coordinates`,
      {
        metrics: {
          lat,
          lng,
          validLngRange: [US_PACIFIC_MIN_LNG, US_PACIFIC_MAX_LNG],
        },
        suggestedFix: 'Re-geocode with state/country context (e.g., "Kingman, AZ, USA")',
      }
    );
  }
  return null;
}

/**
 * INV-GEO-03: Check if coordinate is isolated from other waypoints.
 */
function checkIsolation(
  lat: number,
  lng: number,
  entityId: string,
  otherCoordinates: Array<{ lat: number; lng: number }>
): ViolationObject | null {
  if (otherCoordinates.length === 0) {
    // Can't check isolation with no other points
    return null;
  }

  let minDistance = Infinity;
  for (const other of otherCoordinates) {
    const distance = haversineDistance(lat, lng, other.lat, other.lng);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  if (minDistance > ISOLATED_POINT_THRESHOLD_METERS) {
    return createViolation(
      'INV-GEO-03',
      'ERROR',
      'COORDINATE',
      entityId,
      `Coordinate is ${Math.round(minDistance / 1609.34)} miles from nearest waypoint - likely invalid`,
      {
        metrics: {
          lat,
          lng,
          nearestDistanceMeters: Math.round(minDistance),
          nearestDistanceMiles: Math.round(minDistance / 1609.34),
          threshold: ISOLATED_POINT_THRESHOLD_METERS,
        },
        suggestedFix: 'Interpolate between adjacent valid waypoints',
      }
    );
  }
  return null;
}

// ============================================================================
// Main Validator
// ============================================================================

export interface ValidateCoordinateOptions {
  /** Trust region to validate against. If not provided, will attempt to infer. */
  region?: TrustRegion;
  
  /** Other waypoint coordinates for isolation check (INV-GEO-03) */
  otherCoordinates?: Array<{ lat: number; lng: number }>;
  
  /** Unique identifier for the entity being validated */
  entityId?: string;
}

/**
 * Validate a geographic coordinate against all GEO invariants.
 * 
 * Checks performed:
 * - INV-GEO-02: Null Island detection
 * - INV-GEO-01: Trust boundary validation
 * - INV-GEO-04: Ocean detection (US only)
 * - INV-GEO-03: Isolation detection (if otherCoordinates provided)
 */
export function validateCoordinate(
  lat: number,
  lng: number,
  options: ValidateCoordinateOptions = {}
): GeoValidationResult {
  const violations: ViolationObject[] = [];
  const entityId = options.entityId ?? `coord-${lat.toFixed(4)}-${lng.toFixed(4)}`;

  // Basic validity checks
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    violations.push(
      createViolation(
        'INV-GEO-02',
        'ERROR',
        'COORDINATE',
        entityId,
        'Coordinate contains non-finite values',
        { metrics: { lat, lng } }
      )
    );
    return { valid: false, violations, confidence: 'FAILED' };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    violations.push(
      createViolation(
        'INV-GEO-01',
        'ERROR',
        'COORDINATE',
        entityId,
        'Coordinate is outside valid geographic range',
        { metrics: { lat, lng, validLatRange: [-90, 90], validLngRange: [-180, 180] } }
      )
    );
    return { valid: false, violations, confidence: 'FAILED' };
  }

  // INV-GEO-02: Null Island
  const nullIslandViolation = checkNullIsland(lat, lng, entityId);
  if (nullIslandViolation) {
    violations.push(nullIslandViolation);
  }

  // Determine region
  const region = options.region ?? inferTrustRegion(lat, lng);
  
  if (region) {
    // INV-GEO-01: Trust boundary
    const boundaryViolation = checkTrustBoundary(lat, lng, region, entityId);
    if (boundaryViolation) {
      violations.push(boundaryViolation);
    }

    // INV-GEO-04: Ocean detection (US only)
    const oceanViolation = checkOceanDetection(lat, lng, region, entityId);
    if (oceanViolation) {
      violations.push(oceanViolation);
    }
  }

  // INV-GEO-03: Isolation check
  if (options.otherCoordinates && options.otherCoordinates.length > 0) {
    const isolationViolation = checkIsolation(lat, lng, entityId, options.otherCoordinates);
    if (isolationViolation) {
      violations.push(isolationViolation);
    }
  }

  // Determine confidence
  let confidence: GeoValidationResult['confidence'] = 'HIGH';
  if (violations.length > 0) {
    const hasErrors = violations.some(v => v.severity === 'ERROR');
    confidence = hasErrors ? 'FAILED' : 'MEDIUM';
  } else if (!region) {
    // Valid but couldn't determine region - slightly lower confidence
    confidence = 'MEDIUM';
  }

  return {
    valid: violations.length === 0,
    violations,
    confidence,
  };
}

/**
 * Quick check if a coordinate is obviously invalid.
 * Use this for fast filtering before full validation.
 */
export function isObviouslyInvalid(lat: number, lng: number): boolean {
  // Non-finite
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  
  // Out of valid range
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return true;
  
  // Null Island
  if (lat === 0 && lng === 0) return true;
  
  return false;
}

/**
 * Validate multiple coordinates and return aggregated results.
 */
export function validateCoordinates(
  coordinates: Array<{ lat: number; lng: number; entityId?: string }>,
  region?: TrustRegion
): GeoValidationResult {
  const allViolations: ViolationObject[] = [];
  let worstConfidence: GeoValidationResult['confidence'] = 'HIGH';

  // Build list of all coordinates for isolation checks
  const allCoords = coordinates.map(c => ({ lat: c.lat, lng: c.lng }));

  for (let i = 0; i < coordinates.length; i++) {
    const coord = coordinates[i];
    const otherCoords = allCoords.filter((_, j) => j !== i);
    
    const result = validateCoordinate(coord.lat, coord.lng, {
      region,
      otherCoordinates: otherCoords,
      entityId: coord.entityId ?? `coord-${i}`,
    });

    allViolations.push(...result.violations);
    
    // Track worst confidence
    if (result.confidence === 'FAILED') worstConfidence = 'FAILED';
    else if (result.confidence === 'LOW' && worstConfidence !== 'FAILED') worstConfidence = 'LOW';
    else if (result.confidence === 'MEDIUM' && worstConfidence === 'HIGH') worstConfidence = 'MEDIUM';
  }

  return {
    valid: allViolations.length === 0,
    violations: allViolations,
    confidence: worstConfidence,
  };
}
