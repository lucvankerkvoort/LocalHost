import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TripPlanWritePayloadSchema,
  formatTripPlanValidationIssues,
} from './trip-plan.schema';

test('TripPlanWritePayloadSchema accepts minimal stop payload', () => {
  const result = TripPlanWritePayloadSchema.safeParse({
    stops: [{ title: 'Los Angeles' }],
  });

  assert.equal(result.success, true);
});

test('TripPlanWritePayloadSchema accepts detailed stop/day/item payload', () => {
  const result = TripPlanWritePayloadSchema.safeParse({
    stops: [
      {
        title: 'Los Angeles',
        type: 'CITY',
        locations: [{ name: 'Los Angeles', lat: 34.0522, lng: -118.2437, placeId: 'abc123' }],
        order: 0,
        days: [
          {
            dayIndex: 1,
            title: 'Day 1',
            suggestedHosts: [],
            items: [
              {
                type: 'SIGHT',
                title: 'Griffith Observatory',
                locationName: 'Griffith Observatory',
                placeId: 'def456',
                hostId: 'host_123',
                lat: 34.1184,
                lng: -118.3004,
                orderIndex: 0,
                createdByAI: true,
              },
            ],
          },
        ],
      },
    ],
    preferences: { pace: 'balanced' },
    title: 'LA Trip',
  });

  assert.equal(result.success, true);
});

test('TripPlanWritePayloadSchema rejects payload without stops', () => {
  const result = TripPlanWritePayloadSchema.safeParse({
    preferences: { pace: 'balanced' },
  });

  assert.equal(result.success, false);
  if (!result.success) {
    const issues = formatTripPlanValidationIssues(result.error);
    assert.equal(issues[0]?.path, 'stops');
  }
});

test('TripPlanWritePayloadSchema rejects non-integer dayIndex', () => {
  const result = TripPlanWritePayloadSchema.safeParse({
    stops: [
      {
        title: 'Los Angeles',
        days: [{ dayIndex: 1.5 }],
      },
    ],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    const issues = formatTripPlanValidationIssues(result.error);
    assert.equal(issues[0]?.path, 'stops.0.days.0.dayIndex');
  }
});
