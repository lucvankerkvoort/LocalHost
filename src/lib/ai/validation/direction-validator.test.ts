import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  validateDirectionality,
  inferOriginAndTerminus,
  buildRegenerationConstraints,
  DirectionalityInput,
} from './direction-validator';

// Test coordinates (approximate)
const LA = { lat: 34.05, lng: -118.24 };       // Los Angeles
const VEGAS = { lat: 36.17, lng: -115.14 };    // Las Vegas
const PHOENIX = { lat: 33.45, lng: -112.07 };  // Phoenix  
const FLAGSTAFF = { lat: 35.20, lng: -111.63 };// Flagstaff
const ALBUQUERQUE = { lat: 35.08, lng: -106.65 }; // Albuquerque
const OKLAHOMA = { lat: 35.47, lng: -97.52 };  // Oklahoma City
const CHICAGO = { lat: 41.88, lng: -87.63 };   // Chicago

describe('inferOriginAndTerminus', () => {
  test('returns origin and terminus for ONE_WAY trip', () => {
    const dayAnchors = [
      { dayNumber: 1, ...LA },
      { dayNumber: 2, ...VEGAS },
      { dayNumber: 3, ...CHICAGO },
    ];
    
    const result = inferOriginAndTerminus(dayAnchors, 'ONE_WAY');
    assert.ok(result);
    assert.deepEqual(result.origin, { lat: LA.lat, lng: LA.lng });
    assert.deepEqual(result.terminus, { lat: CHICAGO.lat, lng: CHICAGO.lng });
  });

  test('returns same origin and terminus for ROUND_TRIP', () => {
    const dayAnchors = [
      { dayNumber: 1, ...LA },
      { dayNumber: 2, ...VEGAS },
      { dayNumber: 3, ...LA },
    ];
    
    const result = inferOriginAndTerminus(dayAnchors, 'ROUND_TRIP');
    assert.ok(result);
    assert.deepEqual(result.origin, result.terminus);
  });

  test('returns null for empty dayAnchors', () => {
    const result = inferOriginAndTerminus([], 'ONE_WAY');
    assert.equal(result, null);
  });
});

describe('validateDirectionality', () => {
  describe('INV-DIR-01: No Backward Progress', () => {
    test('fails when Day N is closer to origin than Day N-1', () => {
      // LA -> Vegas -> LA (going back!)
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
          { dayNumber: 2, ...VEGAS, city: 'Las Vegas' },
          { dayNumber: 3, ...LA, city: 'Los Angeles' }, // Back to origin!
        ],
      };

      const result = validateDirectionality(input);
      assert.equal(result.valid, false);
      // Should have violations for both DIR-01 (backward) and DIR-03 (origin revisit)
      assert.ok(result.violations.length > 0);
    });

    test('passes for steady eastward progress', () => {
      // LA -> Flagstaff -> Albuquerque -> Oklahoma -> Chicago
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
          { dayNumber: 2, ...FLAGSTAFF, city: 'Flagstaff' },
          { dayNumber: 3, ...ALBUQUERQUE, city: 'Albuquerque' },
          { dayNumber: 4, ...OKLAHOMA, city: 'Oklahoma City' },
          { dayNumber: 5, ...CHICAGO, city: 'Chicago' },
        ],
      };

      const result = validateDirectionality(input);
      assert.equal(result.valid, true);
      assert.equal(result.violations.length, 0);
    });

    test('allows minor detours (<20 miles backward)', () => {
      // Slight backward movement should be tolerated
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [
          { dayNumber: 1, ...LA },
          { dayNumber: 2, lat: 35.0, lng: -115.0 }, // Somewhere east
          { dayNumber: 3, lat: 35.1, lng: -115.1 }, // Slightly back (< 20mi)
        ],
      };

      const result = validateDirectionality(input);
      // Should pass because regression is minimal
      assert.equal(result.violations.filter(v => v.code === 'INV-DIR-01').length, 0);
    });
  });

  describe('INV-DIR-02: Cardinal Progress Toward Terminus', () => {
    test('fails when Day N is further from terminus than Day N-1', () => {
      // Getting further from Chicago instead of closer
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
          { dayNumber: 2, ...ALBUQUERQUE, city: 'Albuquerque' },
          { dayNumber: 3, ...PHOENIX, city: 'Phoenix' }, // Southwest, away from Chicago!
        ],
      };

      const result = validateDirectionality(input);
      assert.equal(result.valid, false);
      assert.ok(result.violations.some(v => 
        v.code === 'INV-DIR-02' || v.code === 'INV-DIR-01'
      ));
    });

    test('does not apply DIR-02 to ROUND_TRIP', () => {
      const input: DirectionalityInput = {
        origin: LA,
        terminus: LA, // Round trip
        tripType: 'ROUND_TRIP',
        dayAnchors: [
          { dayNumber: 1, ...LA },
          { dayNumber: 2, ...VEGAS },
          { dayNumber: 3, ...FLAGSTAFF },
          { dayNumber: 4, ...VEGAS }, // Heading back
          { dayNumber: 5, ...LA }, // Return to origin
        ],
      };

      const result = validateDirectionality(input);
      // DIR-02 should not trigger for round trips
      assert.equal(result.violations.filter(v => v.code === 'INV-DIR-02').length, 0);
    });
  });

  describe('INV-DIR-03: No Origin After Day 1', () => {
    test('fails when origin city appears on intermediate day (one-way)', () => {
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
          { dayNumber: 2, ...VEGAS, city: 'Las Vegas' },
          { dayNumber: 3, ...LA, city: 'Los Angeles' }, // Not allowed!
          { dayNumber: 4, ...CHICAGO, city: 'Chicago' },
        ],
      };

      const result = validateDirectionality(input);
      assert.equal(result.valid, false);
      assert.ok(result.violations.some(v => v.code === 'INV-DIR-03'));
    });

    test('passes when round-trip returns to origin on FINAL day only', () => {
      const input: DirectionalityInput = {
        origin: LA,
        terminus: LA,
        tripType: 'ROUND_TRIP',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
          { dayNumber: 2, ...VEGAS, city: 'Las Vegas' },
          { dayNumber: 3, ...LA, city: 'Los Angeles' }, // Final day, ok!
        ],
      };

      const result = validateDirectionality(input);
      const dir03Violations = result.violations.filter(v => v.code === 'INV-DIR-03');
      assert.equal(dir03Violations.length, 0);
    });

    test('fails when round-trip returns to origin on non-final day', () => {
      const input: DirectionalityInput = {
        origin: LA,
        terminus: LA,
        tripType: 'ROUND_TRIP',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
          { dayNumber: 2, ...LA, city: 'Los Angeles' }, // Day 2 at origin - not final!
          { dayNumber: 3, ...VEGAS, city: 'Las Vegas' },
          { dayNumber: 4, ...LA, city: 'Los Angeles' }, // Final day, ok
        ],
      };

      const result = validateDirectionality(input);
      const dir03Violations = result.violations.filter(v => v.code === 'INV-DIR-03');
      assert.ok(dir03Violations.length > 0);
      assert.equal(dir03Violations[0].metrics?.dayNumber, 2);
    });
  });

  describe('Edge Cases', () => {
    test('returns valid for empty dayAnchors', () => {
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [],
      };

      const result = validateDirectionality(input);
      assert.equal(result.valid, true);
    });

    test('returns valid for single-day trip', () => {
      const input: DirectionalityInput = {
        origin: LA,
        terminus: CHICAGO,
        tripType: 'ONE_WAY',
        dayAnchors: [
          { dayNumber: 1, ...LA, city: 'Los Angeles' },
        ],
      };

      const result = validateDirectionality(input);
      assert.equal(result.valid, true);
    });
  });
});

describe('buildRegenerationConstraints', () => {
  test('converts violations to actionable constraints', () => {
    const violations = [
      {
        code: 'INV-DIR-01' as const,
        severity: 'ERROR' as const,
        entityType: 'DAY' as const,
        entityId: 'day-3',
        message: 'Day 3 is closer to origin',
        metrics: { dayNumber: 3 },
        suggestedFix: 'Day 3 MUST be located further from origin than Day 2',
        autoFixApplied: false,
        timestamp: new Date().toISOString(),
      },
      {
        code: 'INV-DIR-03' as const,
        severity: 'ERROR' as const,
        entityType: 'DAY' as const,
        entityId: 'day-5',
        message: 'Day 5 returns to origin',
        metrics: { dayNumber: 5 },
        suggestedFix: 'Day 5 MUST NOT be at the origin city',
        autoFixApplied: false,
        timestamp: new Date().toISOString(),
      },
    ];

    const constraints = buildRegenerationConstraints(violations);
    
    assert.equal(constraints.length, 2);
    assert.ok(constraints[0].includes('Day 3'));
    assert.ok(constraints[1].includes('Day 5'));
  });
});
