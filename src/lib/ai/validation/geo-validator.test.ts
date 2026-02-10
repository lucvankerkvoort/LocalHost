import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  validateCoordinate,
  validateCoordinates,
  isObviouslyInvalid,
  inferTrustRegion,
} from './geo-validator';

describe('inferTrustRegion', () => {
  test('identifies US Continental coordinates', () => {
    // Los Angeles
    assert.equal(inferTrustRegion(34.05, -118.24), 'US_CONTINENTAL');
    // Chicago
    assert.equal(inferTrustRegion(41.88, -87.63), 'US_CONTINENTAL');
  });

  test('identifies European coordinates', () => {
    // Paris
    assert.equal(inferTrustRegion(48.86, 2.35), 'EUROPE');
    // Rome
    assert.equal(inferTrustRegion(41.9, 12.5), 'EUROPE');
  });

  test('returns null for unrecognized coordinates', () => {
    // Middle of Pacific Ocean
    assert.equal(inferTrustRegion(0, -150), null);
    // Antarctica
    assert.equal(inferTrustRegion(-80, 0), null);
  });
});

describe('isObviouslyInvalid', () => {
  test('detects null island', () => {
    assert.equal(isObviouslyInvalid(0, 0), true);
  });

  test('detects out of range coordinates', () => {
    assert.equal(isObviouslyInvalid(91, 0), true);
    assert.equal(isObviouslyInvalid(-91, 0), true);
    assert.equal(isObviouslyInvalid(0, 181), true);
    assert.equal(isObviouslyInvalid(0, -181), true);
  });

  test('detects non-finite values', () => {
    assert.equal(isObviouslyInvalid(NaN, 0), true);
    assert.equal(isObviouslyInvalid(0, Infinity), true);
  });

  test('allows valid coordinates', () => {
    assert.equal(isObviouslyInvalid(34.05, -118.24), false);
    assert.equal(isObviouslyInvalid(48.86, 2.35), false);
  });
});

describe('validateCoordinate', () => {
  describe('INV-GEO-02: Null Island Detection', () => {
    test('fails for (0, 0)', () => {
      const result = validateCoordinate(0, 0);
      assert.equal(result.valid, false);
      assert.equal(result.confidence, 'FAILED');
      assert.equal(result.violations.length, 1);
      assert.equal(result.violations[0].code, 'INV-GEO-02');
    });
  });

  describe('INV-GEO-01: Trust Boundary Validation', () => {
    test('passes for LA in US_CONTINENTAL', () => {
      const result = validateCoordinate(34.05, -118.24, { region: 'US_CONTINENTAL' });
      assert.equal(result.valid, true);
      assert.equal(result.violations.length, 0);
    });

    test('fails for Rome when region is US_CONTINENTAL', () => {
      const result = validateCoordinate(41.9, 12.5, { region: 'US_CONTINENTAL' });
      assert.equal(result.valid, false);
      assert.ok(result.violations.some(v => v.code === 'INV-GEO-01'));
    });

    test('passes for Rome in EUROPE', () => {
      const result = validateCoordinate(41.9, 12.5, { region: 'EUROPE' });
      assert.equal(result.valid, true);
    });
  });

  describe('INV-GEO-04: Ocean Detection (US)', () => {
    test('fails for Pacific Ocean coordinates in US trip', () => {
      // Kingman bug: resolved to wrong coordinates
      const result = validateCoordinate(34.2, -160.1, { region: 'US_CONTINENTAL' });
      assert.equal(result.valid, false);
      // Should fail either GEO-01 (outside trust boundary) or GEO-04 (ocean detection)
      assert.ok(result.violations.some(v => v.code === 'INV-GEO-01' || v.code === 'INV-GEO-04'));
    });

    test('passes for valid US coordinates', () => {
      // Kingman, AZ (correct coordinates)
      const result = validateCoordinate(35.19, -114.05, { region: 'US_CONTINENTAL' });
      assert.equal(result.valid, true);
    });

    test('does not apply ocean detection to EUROPE', () => {
      // Negative longitude in Atlantic but valid for Europe
      const result = validateCoordinate(37.0, -9.0, { region: 'EUROPE' });
      assert.equal(result.valid, true);
      assert.equal(result.violations.filter(v => v.code === 'INV-GEO-04').length, 0);
    });
  });

  describe('INV-GEO-03: Isolation Detection', () => {
    test('fails for coordinate 600+ miles from all others', () => {
      const otherCoordinates = [
        { lat: 34.05, lng: -118.24 }, // LA
        { lat: 36.17, lng: -115.14 }, // Las Vegas
      ];
      
      // New York is ~2500 miles from LA/Vegas
      const result = validateCoordinate(40.71, -74.01, {
        region: 'US_CONTINENTAL',
        otherCoordinates,
      });
      
      assert.ok(result.violations.some(v => v.code === 'INV-GEO-03'));
    });

    test('passes for coordinate within 500 miles of neighbors', () => {
      const otherCoordinates = [
        { lat: 34.05, lng: -118.24 }, // LA
        { lat: 36.17, lng: -115.14 }, // Las Vegas
      ];
      
      // Phoenix, ~300 miles from Vegas
      const result = validateCoordinate(33.45, -112.07, {
        region: 'US_CONTINENTAL',
        otherCoordinates,
      });
      
      assert.equal(result.violations.filter(v => v.code === 'INV-GEO-03').length, 0);
    });

    test('skips isolation check when no other coordinates provided', () => {
      const result = validateCoordinate(40.71, -74.01, { region: 'US_CONTINENTAL' });
      assert.equal(result.violations.filter(v => v.code === 'INV-GEO-03').length, 0);
    });
  });

  describe('Edge Cases', () => {
    test('handles non-finite values', () => {
      const result = validateCoordinate(NaN, -118.24);
      assert.equal(result.valid, false);
      assert.equal(result.confidence, 'FAILED');
    });

    test('handles out of range latitude', () => {
      const result = validateCoordinate(91, 0);
      assert.equal(result.valid, false);
    });

    test('handles out of range longitude', () => {
      const result = validateCoordinate(0, 181);
      assert.equal(result.valid, false);
    });

    test('infers region when not provided', () => {
      // LA should auto-detect US_CONTINENTAL
      const result = validateCoordinate(34.05, -118.24);
      assert.equal(result.valid, true);
      assert.equal(result.confidence, 'HIGH');
    });

    test('sets MEDIUM confidence when region cannot be inferred', () => {
      // Middle of nowhere (valid but no region)
      const result = validateCoordinate(-45, -120);
      assert.equal(result.valid, true);
      assert.equal(result.confidence, 'MEDIUM');
    });
  });
});

describe('validateCoordinates', () => {
  test('validates all coordinates in array', () => {
    const coordinates = [
      { lat: 34.05, lng: -118.24, entityId: 'day-1' },  // LA
      { lat: 35.19, lng: -114.05, entityId: 'day-2' },  // Kingman
      { lat: 35.22, lng: -111.64, entityId: 'day-3' },  // Flagstaff
    ];

    const result = validateCoordinates(coordinates, 'US_CONTINENTAL');
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });

  test('detects isolated point in multi-coordinate validation', () => {
    const coordinates = [
      { lat: 34.05, lng: -118.24, entityId: 'day-1' },  // LA
      { lat: 35.19, lng: -114.05, entityId: 'day-2' },  // Kingman
      { lat: 48.86, lng: 2.35, entityId: 'day-3' },     // Paris (isolated!)
    ];

    const result = validateCoordinates(coordinates, 'US_CONTINENTAL');
    assert.equal(result.valid, false);
    // Paris should fail trust boundary AND isolation
    assert.ok(result.violations.length > 0);
  });

  test('tracks worst confidence across all coordinates', () => {
    const coordinates = [
      { lat: 34.05, lng: -118.24 },  // Valid
      { lat: 0, lng: 0 },            // Null Island - FAILED
    ];

    const result = validateCoordinates(coordinates, 'US_CONTINENTAL');
    assert.equal(result.confidence, 'FAILED');
  });
});
