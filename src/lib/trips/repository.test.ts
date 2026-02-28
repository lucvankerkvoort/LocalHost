import assert from 'node:assert/strict';
import test from 'node:test';

import { mapTripPlanStopsToInputPayload, type TripPlanStopSnapshot } from './repository';

test('mapTripPlanStopsToInputPayload preserves placeId and hostId while normalizing dates', () => {
  const date = new Date('2026-03-10T08:00:00.000Z');
  const start = new Date('2026-03-10T10:30:00.000Z');
  const end = new Date('2026-03-10T12:00:00.000Z');

  const stops: TripPlanStopSnapshot[] = [
    {
      title: 'Los Angeles',
      type: 'CITY',
      locations: [
        {
          name: 'Los Angeles',
          lat: 34.0522,
          lng: -118.2437,
          placeId: 'city_place_1',
        },
      ],
      days: [
        {
          dayIndex: 1,
          date,
          title: 'Day 1',
          suggestedHosts: [],
          items: [
            {
              type: 'SIGHT',
              title: 'Griffith Observatory',
              description: 'Views',
              startTime: start,
              endTime: end,
              locationName: 'Griffith Observatory',
              placeId: 'item_place_1',
              lat: 34.1184,
              lng: -118.3004,
              experienceId: 'exp_1',
              hostId: 'host_1',
              createdByAI: true,
            },
          ],
        },
      ],
    },
  ];

  const payload = mapTripPlanStopsToInputPayload(stops);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].locations?.[0]?.placeId, 'city_place_1');
  assert.equal(payload[0].days?.[0]?.date, '2026-03-10T08:00:00.000Z');
  assert.equal(payload[0].days?.[0]?.items?.[0]?.startTime, '2026-03-10T10:30:00.000Z');
  assert.equal(payload[0].days?.[0]?.items?.[0]?.endTime, '2026-03-10T12:00:00.000Z');
  assert.equal(payload[0].days?.[0]?.items?.[0]?.placeId, 'item_place_1');
  assert.equal(payload[0].days?.[0]?.items?.[0]?.hostId, 'host_1');
});
