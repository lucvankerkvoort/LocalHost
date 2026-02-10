import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  validateCorridorAdherence,
  summarizeCorridorAdherence,
} from './corridor-validator';

// Mock polyline roughly following Route 66: LA -> Vegas -> Flagstaff -> Albuquerque
const ROUTE_66_POLYLINE = [
  { lat: 34.05, lng: -118.24 },   // LA
  { lat: 34.1, lng: -116.0 },     // Near Barstow
  { lat: 35.0, lng: -115.5 },     // Near Vegas
  { lat: 35.2, lng: -114.0 },     // Kingman area
  { lat: 35.2, lng: -111.6 },     // Flagstaff
  { lat: 35.1, lng: -106.6 },     // Albuquerque
];

describe('validateCorridorAdherence', () => {
  describe('INV-CORR-01: Polyline Exists', () => {
    test('warns when polyline is empty', () => {
      const result = validateCorridorAdherence({
        polyline: [],
        dayAnchors: [
          { dayNumber: 1, lat: 34.05, lng: -118.24, city: 'Los Angeles' },
        ],
      });

      assert.equal(result.valid, true); // Non-blocking
      assert.ok(result.violations.some(v => v.code === 'INV-CORR-01'));
    });

    test('warns when polyline has only one point', () => {
      const result = validateCorridorAdherence({
        polyline: [{ lat: 34.05, lng: -118.24 }],
        dayAnchors: [{ dayNumber: 1, lat: 34.05, lng: -118.24 }],
      });

      assert.ok(result.violations.some(v => v.code === 'INV-CORR-01'));
    });
  });

  describe('INV-CORR-02: Anchor Deviation', () => {
    test('passes when anchors are close to route', () => {
      const result = validateCorridorAdherence({
        polyline: ROUTE_66_POLYLINE,
        dayAnchors: [
          { dayNumber: 1, lat: 34.05, lng: -118.24, city: 'Los Angeles' },
          { dayNumber: 2, lat: 35.19, lng: -114.05, city: 'Kingman' },
          { dayNumber: 3, lat: 35.20, lng: -111.65, city: 'Flagstaff' },
        ],
      });

      const summary = summarizeCorridorAdherence(result);
      assert.equal(summary.withinCorridor, true);
      assert.equal(summary.anchorDeviations, 0);
    });

    test('warns when anchor is >50 miles from route', () => {
      const result = validateCorridorAdherence({
        polyline: ROUTE_66_POLYLINE,
        dayAnchors: [
          { dayNumber: 1, lat: 34.05, lng: -118.24, city: 'Los Angeles' },
          { dayNumber: 2, lat: 33.45, lng: -112.07, city: 'Phoenix' }, // ~100 miles off route
          { dayNumber: 3, lat: 35.20, lng: -111.65, city: 'Flagstaff' },
        ],
      });

      assert.ok(result.violations.some(v => 
        v.code === 'INV-CORR-02' && v.entityId === 'day-2'
      ));
      
      const summary = summarizeCorridorAdherence(result);
      assert.equal(summary.anchorDeviations, 1);
    });
  });

  describe('INV-CORR-03: Activity Deviation', () => {
    test('passes when activities are close to route', () => {
      const result = validateCorridorAdherence({
        polyline: ROUTE_66_POLYLINE,
        dayAnchors: [
          { dayNumber: 1, lat: 34.05, lng: -118.24 },
        ],
        activities: [
          { id: 'act-1', name: 'Santa Monica Pier', dayNumber: 1, lat: 34.01, lng: -118.49 },
          { id: 'act-2', name: 'Route 66 Museum', dayNumber: 1, lat: 34.1, lng: -116.0 },
        ],
      });

      const summary = summarizeCorridorAdherence(result);
      assert.equal(summary.activityDeviations, 0);
    });

    test('warns when activity is >75 miles from route', () => {
      const result = validateCorridorAdherence({
        polyline: ROUTE_66_POLYLINE,
        dayAnchors: [
          { dayNumber: 1, lat: 34.05, lng: -118.24 },
        ],
        activities: [
          { id: 'act-1', name: 'San Diego Zoo', dayNumber: 1, lat: 32.73, lng: -117.15 }, // ~120 miles from route
        ],
      });

      assert.ok(result.violations.some(v => 
        v.code === 'INV-CORR-03' && v.entityId === 'act-1'
      ));
    });
  });

  describe('Edge Cases', () => {
    test('handles empty dayAnchors', () => {
      const result = validateCorridorAdherence({
        polyline: ROUTE_66_POLYLINE,
        dayAnchors: [],
      });

      assert.equal(result.valid, true);
      assert.equal(result.violations.filter(v => v.code === 'INV-CORR-02').length, 0);
    });

    test('all violations are non-blocking warnings', () => {
      const result = validateCorridorAdherence({
        polyline: ROUTE_66_POLYLINE,
        dayAnchors: [
          { dayNumber: 1, lat: 40.71, lng: -74.01, city: 'New York' }, // Way off route
        ],
      });

      assert.equal(result.valid, true);
      for (const v of result.violations) {
        assert.equal(v.severity, 'WARN');
      }
    });
  });
});
