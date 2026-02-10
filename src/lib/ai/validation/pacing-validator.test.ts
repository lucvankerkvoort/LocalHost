import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  validatePacing,
  summarizePacing,
} from './pacing-validator';

describe('validatePacing', () => {
  describe('INV-PACE-01: Minimum Activities', () => {
    test('passes when all days have 2+ activities', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 3 },
          { dayNumber: 2, activityCount: 2 },
          { dayNumber: 3, activityCount: 4 },
        ],
      });

      const summary = summarizePacing(result);
      assert.equal(summary.lowActivityDays, 0);
    });

    test('warns when day has <2 activities', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 3 },
          { dayNumber: 2, activityCount: 1 },
          { dayNumber: 3, activityCount: 2 },
        ],
      });

      assert.ok(result.violations.some(v => 
        v.code === 'INV-PACE-01' && v.entityId === 'day-2'
      ));
    });

    test('allows 1 activity for high-driving days (>300 miles)', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 1, drivingDistanceMeters: 500000 }, // ~310 miles
        ],
      });

      // Should NOT flag PACE-01 for high-driving day with 1 activity
      assert.equal(result.violations.filter(v => v.code === 'INV-PACE-01').length, 0);
    });
  });

  describe('INV-PACE-02: Maximum Driving', () => {
    test('passes when driving is under 400 miles', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 2, drivingDistanceMeters: 400000 }, // ~250 miles
        ],
      });

      const summary = summarizePacing(result);
      assert.equal(summary.highDrivingDays, 0);
    });

    test('warns when driving exceeds 400 miles', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 2, drivingDistanceMeters: 700000 }, // ~435 miles
        ],
      });

      assert.ok(result.violations.some(v => v.code === 'INV-PACE-02'));
    });
  });

  describe('INV-PACE-03: Empty Days', () => {
    test('fails (blocking) when day has 0 activities', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 3 },
          { dayNumber: 2, activityCount: 0, city: 'Ghost Town' },
          { dayNumber: 3, activityCount: 2 },
        ],
      });

      assert.equal(result.valid, false); // Blocking!
      assert.ok(result.violations.some(v => 
        v.code === 'INV-PACE-03' && v.severity === 'ERROR'
      ));
    });

    test('passes when all days have at least 1 activity', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 1 },
          { dayNumber: 2, activityCount: 2 },
        ],
      });

      const summary = summarizePacing(result);
      assert.equal(summary.hasEmptyDays, false);
    });
  });

  describe('INV-PACE-04: Activity Variance', () => {
    test('passes when variance is reasonable', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 3 },
          { dayNumber: 2, activityCount: 2 },
          { dayNumber: 3, activityCount: 4 },
        ],
      });

      const summary = summarizePacing(result);
      assert.equal(summary.hasHighVariance, false);
    });

    test('warns when variance exceeds 4 activities', () => {
      const result = validatePacing({
        days: [
          { dayNumber: 1, activityCount: 8 }, // Very busy
          { dayNumber: 2, activityCount: 3 },
          { dayNumber: 3, activityCount: 2 }, // Sparse
        ],
      });

      assert.ok(result.violations.some(v => v.code === 'INV-PACE-04'));
    });
  });

  describe('Edge Cases', () => {
    test('returns valid for empty days array', () => {
      const result = validatePacing({ days: [] });
      assert.equal(result.valid, true);
      assert.equal(result.violations.length, 0);
    });

    test('handles single day trip', () => {
      const result = validatePacing({
        days: [{ dayNumber: 1, activityCount: 3 }],
      });

      assert.equal(result.valid, true);
    });
  });
});
