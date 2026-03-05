import assert from 'node:assert/strict';
import test from 'node:test';

import { TripContextEnvelopeSchema } from './planner-trip-context';

test('TripContextEnvelopeSchema accepts trip_context_v1 payload', () => {
  const parsed = TripContextEnvelopeSchema.safeParse({
    schemaVersion: 'trip_context_v1',
    context: {
      tripId: 'trip_123',
      title: 'Road Trip',
      status: 'PLANNED',
      summary: {
        stopCount: 2,
        dayCount: 4,
        itemCount: 10,
      },
      knownPlaceNames: ['Los Angeles', 'Zion National Park'],
      stops: [
        {
          title: 'Los Angeles',
          type: 'CITY',
          dayCount: 2,
          days: [
            {
              dayIndex: 1,
              title: 'Arrival',
              itemCount: 2,
              items: [
                {
                  title: 'Griffith Observatory',
                  type: 'SIGHT',
                  locationName: 'Los Angeles',
                },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(parsed.success, true);
});

test('TripContextEnvelopeSchema rejects non-versioned payloads', () => {
  const parsed = TripContextEnvelopeSchema.safeParse({
    schemaVersion: 'trip_context',
    context: {
      tripId: 'trip_123',
      title: 'Road Trip',
      status: 'PLANNED',
      summary: {
        stopCount: 0,
        dayCount: 0,
        itemCount: 0,
      },
      knownPlaceNames: [],
      stops: [],
    },
  });

  assert.equal(parsed.success, false);
});

test('TripContextEnvelopeSchema rejects invalid itinerary item types', () => {
  const parsed = TripContextEnvelopeSchema.safeParse({
    schemaVersion: 'trip_context_v1',
    context: {
      tripId: 'trip_123',
      title: 'Road Trip',
      status: 'PLANNED',
      summary: {
        stopCount: 1,
        dayCount: 1,
        itemCount: 1,
      },
      knownPlaceNames: ['Los Angeles'],
      stops: [
        {
          title: 'Los Angeles',
          type: 'CITY',
          dayCount: 1,
          days: [
            {
              dayIndex: 1,
              title: 'Arrival',
              itemCount: 1,
              items: [
                {
                  title: 'Random place',
                  type: 'SHOPPING',
                  locationName: 'Los Angeles',
                },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(parsed.success, false);
});
